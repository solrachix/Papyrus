import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, rootDir, '');

  const isDocs = mode === 'docs';
  const copyLibarchiveWasm = () => ({
    name: 'copy-libarchive-wasm',
    apply: 'build' as const,
    generateBundle() {
      const wasmPath = path.resolve(
        rootDir,
        'node_modules/libarchive.js/dist/libarchive.wasm'
      );
      this.emitFile({
        type: 'asset',
        fileName: 'assets/libarchive.wasm',
        source: fs.readFileSync(wasmPath),
      });
    },
  });

  return {
    root: __dirname,
    base: isDocs ? './' : '/',
    server: {
      port: 3005,
      host: '0.0.0.0',
      fs: {
        allow: [rootDir],
      },
    },
    plugins: [react(), copyLibarchiveWasm()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: [
        { find: '@papyrus-sdk/ui-react/base.css', replacement: `${rootDir}/packages/ui-react/base.css` },
        { find: '@papyrus-sdk/ui-react', replacement: `${rootDir}/packages/ui-react/index.ts` },
        { find: '@papyrus-sdk/engine-rust', replacement: `${rootDir}/packages/engine-rust/index.ts` },
        { find: '@papyrus-sdk/engine-cbz-rust', replacement: `${rootDir}/packages/engine-cbz-rust/index.ts` },
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
