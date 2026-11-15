// 日記の投稿画面（PWA）用のアイコンを public/diary-app に書き出す
// 実行: pnpm exec tsx scripts/generate-diary-icons.mts
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = fileURLToPath(new URL('../public/diary-app/', import.meta.url));

// 暗い背景にペンのアイコン。maskable で丸く切られても欠けないよう、中央 60% に収める
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#262626"/>
  <g transform="translate(136 136) scale(10)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </g>
</svg>`;

const sizes: [string, number][] = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of sizes) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${outDir}${name}`);
  console.log(`wrote public/diary-app/${name}`);
}
