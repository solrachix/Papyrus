import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.html': 'text',
    };
  },
});
