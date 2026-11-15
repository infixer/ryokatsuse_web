/**
 * Cloudflare Access の JWT を検証する。
 *
 * /admin/* と /api/admin/* は Cloudflare Access で守っているが、Access の設定を外したり
 * パスを変えたりしたときに素通りにならないよう、Worker 側でも署名を確かめる。
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

type Jwk = JsonWebKey & { kid: string };

type JwtHeader = { alg: string; kid: string };
type JwtPayload = {
  aud: string | string[];
  iss: string;
  exp: number;
  nbf?: number;
  email?: string;
};

// 公開鍵は定期的にローテーションされるため、キャッシュは短めにする
const KEY_CACHE_MS = 10 * 60 * 1000;
let keyCache: { domain: string; keys: Jwk[]; fetchedAt: number } | undefined;

const base64UrlDecode = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const decodeJson = <T>(value: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));

const getKeys = async (teamDomain: string, force = false): Promise<Jwk[]> => {
  if (
    !force &&
    keyCache?.domain === teamDomain &&
    Date.now() - keyCache.fetchedAt < KEY_CACHE_MS
  ) {
    return keyCache.keys;
  }
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok)
    throw new Error(`Access の公開鍵を取得できません: ${response.status}`);
  const { keys } = (await response.json()) as { keys: Jwk[] };
  keyCache = { domain: teamDomain, keys, fetchedAt: Date.now() };
  return keys;
};

export type AccessConfig = { teamDomain: string; aud: string };

/** 検証に成功したらペイロード（email など）を、失敗したら null を返す */
export const verifyAccessJwt = async (
  token: string,
  { teamDomain, aud }: AccessConfig,
): Promise<JwtPayload | null> => {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = segments;

  try {
    const header = decodeJson<JwtHeader>(headerPart);
    if (header.alg !== 'RS256') return null;

    let jwk = (await getKeys(teamDomain)).find((key) => key.kid === header.kid);
    // ローテーション直後はキャッシュに新しい鍵が無いので取り直す
    jwk ??= (await getKeys(teamDomain, true)).find(
      (key) => key.kid === header.kid,
    );
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;

    const payload = decodeJson<JwtPayload>(payloadPart);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (!audiences.includes(aud)) return null;
    if (payload.iss !== `https://${teamDomain}`) return null;
    if (payload.exp <= now) return null;
    if (payload.nbf && payload.nbf > now + 60) return null;

    return payload;
  } catch (error) {
    console.error('Access JWT の検証に失敗:', error);
    return null;
  }
};

/** リクエストから Access の JWT を取り出す（ヘッダー優先、無ければ Cookie） */
export const getAccessToken = (request: Request): string | null => {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? match[1] : null;
};
