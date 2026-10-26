// 빌드: 메인 · preload 는 esbuild(CommonJS), 화면은 vite
// 업종: --daycare (또는 GTD_INDUSTRY=daycare) 면 어린이집판 (src/shared/industry.ts). 값을 코드에 박아 넣어 설치판이 환경변수에 기대지 않게
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { rmSync } from 'node:fs';

const industry = process.argv.includes('--daycare') || process.env.GTD_INDUSTRY === 'daycare' ? 'daycare' : 'taekwondo';
const define = { __GTD_INDUSTRY__: JSON.stringify(industry) };

rmSync('out', { recursive: true, force: true });
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true, external: ['electron', 'playwright-core'], logLevel: 'warning', define };
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'out/main/index.js' });
await build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'out/preload/index.js' });
await viteBuild({ configFile: 'vite.config.mjs', logLevel: 'warn', define });
console.log(`빌드 완료: out/ (${industry === 'daycare' ? '어린이집 글뚝딱' : '태권 글뚝딱'})`);
