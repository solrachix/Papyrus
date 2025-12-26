import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, rootDir, '');

  const isDocs = mode === 'docs';
  return {
    root: __dirname,
    base: isDocs ? './' : '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
      fs: {
        allow: [rootDir],
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: [
        { find: '@', replacement: rootDir },
        { find: /^@papyrus-sdk\/(.*)$/, replacement: `${rootDir}/packages/$1` },
      ],
    },
    build: {
      outDir: isDocs ? path.resolve(rootDir, 'docs/public/demo') : path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
  };
});
