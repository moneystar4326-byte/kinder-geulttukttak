// 빌드: 메인 · preload 는 esbuild(CommonJS), 화면은 vite
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { rmSync } from 'node:fs';

rmSync('out', { recursive: true, force: true });
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true, external: ['electron', 'playwright-core'], logLevel: 'warning' };
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'out/main/index.js' });
await build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'out/preload/index.js' });
await viteBuild({ configFile: 'vite.config.mjs', logLevel: 'warn' });
console.log('빌드 완료: out/');
