import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBatches, discover, handleDiscovery, MAX_INPUT_BYTES, readScores, type DiscoveryBindings, type DiscoveryItem } from '../src/lib/discovery';

const items: DiscoveryItem[] = Array.from({ length: 70 }, (_, i) => ({ id: `c${i}`, title: `記事${i}`, url: `/blog/${i}`, kind: '記事', description: 'アクセシビリティの自動テストの仕組み。'.repeat(15) }));
const request = (body: unknown, headers = {}) => new Request('https://infixer.net/api/discover', { method: 'POST', headers: { Origin: 'https://infixer.net', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const limiter = { limit: async () => ({ success: true }) };

test('Japanese corpus is fully covered with byte-bounded model inputs', () => {
  const batches = createBatches('自動検証の仕組みが知りたい', items);
  assert.deepEqual(batches.flatMap(b => b.items.map(i => i.id)), items.map(i => i.id));
  for (const batch of batches) assert.ok(new TextEncoder().encode(JSON.stringify(batch.input)).length <= MAX_INPUT_BYTES);
});

test('ranks all batches, filters unrelated content, keeps only registered URLs and top five', async () => {
  let active = 0;
  let peak = 0;
  const results = await discover('自動テスト', items, { run: async (model, input) => {
    assert.equal(model, 'typesafe/jev');
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return { answers: Object.fromEntries(Object.keys(input.questions).map(id => [id, { type: 'score', score: Number(id.slice(1)) < 64 ? 0 : 2 + Number(id.slice(1)) / 100, url: 'https://invented.invalid' }])) };
  } });
  assert.equal(peak, 2);
  assert.deepEqual(results.map(i => i.id), ['c69', 'c68', 'c67', 'c66', 'c65']);
  assert.ok(results.every(i => i.url.startsWith('/blog/')));
});

test('invalid and incomplete provider answers fail instead of showing false empty results', () => {
  for (const score of [NaN, Infinity, -1, 4, '3']) {
    assert.throws(() => readScores({ answers: { c0: { type: 'score', score } } }, [items[0]]));
  }
  assert.throws(() => readScores({ answers: {} }, [items[0]]));
});

test('rejects invalid requests before invoking AI or loading content', async () => {
  const load = async () => { throw new Error('must not load'); };
  for (const body of [{ query: '' }, { query: ' '.repeat(5) }, { query: 'あ'.repeat(201) }, { query: 4 }, null]) {
    assert.equal((await handleDiscovery(request(body), {}, load)).status, 400);
  }
  assert.equal((await handleDiscovery(request({ query: 'a'.repeat(3000) }), {}, load)).status, 413);
  assert.equal((await handleDiscovery(request({ query: 'CSS' }, { Origin: 'https://other.invalid' }), {}, load)).status, 403);
});

test('rate limit, unavailable binding, provider failure, empty and successful responses', async () => {
  const load = async () => [items[0]];
  const req = () => request({ query: 'ブラウザの仕組み' });
  assert.equal((await handleDiscovery(req(), {}, load)).status, 503);
  const ai = { run: async () => ({ answers: { c0: { type: 'score', score: 3 } } }) };
  const blocked = await handleDiscovery(req(), { AI: ai, DISCOVERY_RATE_LIMITER: { limit: async () => ({ success: false }) } }, load);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '60');
  const env: DiscoveryBindings = { AI: ai, DISCOVERY_RATE_LIMITER: limiter };
  const success = await handleDiscovery(req(), env, load);
  assert.equal(success.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await success.json(), { results: [items[0]] });
  env.AI = { run: async () => ({ answers: { c0: { type: 'score', score: 1 } } }) };
  assert.deepEqual(await (await handleDiscovery(req(), env, load)).json(), { results: [] });
  env.AI = { run: async () => { throw new Error('provider failure'); } };
  assert.equal((await handleDiscovery(req(), env, load)).status, 503);
});
