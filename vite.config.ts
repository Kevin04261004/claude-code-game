import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 등 하위 경로 배포를 고려한 상대 경로 빌드
  base: './',
  build: { target: 'es2022' },
});
