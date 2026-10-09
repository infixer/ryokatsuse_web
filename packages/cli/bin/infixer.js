#!/usr/bin/env node
// TypeScript のソースをそのまま実行する（自分用 CLI なのでビルド工程は持たない）
import { register } from 'tsx/esm/api';

register();
// `infixer posts show … | head` のようにパイプ先が先に閉じても落ちないようにする
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
const { main } = await import('../src/index.ts');
process.exitCode = await main(process.argv.slice(2));
