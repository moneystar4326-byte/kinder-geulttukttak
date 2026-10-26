// 휴대폰판 화면 빌드. ../src 의 공통 코드(글 만들기 흐름 · 지시문 · 규칙)를 그대로 가져다 씀
// node 전용 모듈은 shims 로 바꿔 끼움 (이미지 참고 파일 읽기처럼 휴대폰에서 안 쓰는 부분만 쓰던 것)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^node:fs$/, replacement: here('./src/shims/fs.ts') },
      { find: /^node:path$/, replacement: here('./src/shims/path.ts') },
      { find: /^openai$/, replacement: here('./src/shims/openai.ts') },
    ],
  },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
