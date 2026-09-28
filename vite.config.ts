import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo>/, so assets resolve under
  // that path. Change it if the repository is ever renamed.
  base: '/bts-order-checking/',
  build: { outDir: 'dist' },
  test: {
    globals: true,
    environment: 'node',
  },
} as never);
