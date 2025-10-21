import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      hydratable: true
    }
  })],
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../media'),
    emptyOutDir: true,
    assetsDir: '.',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        'data-editor/main': path.resolve(__dirname, './src/main.ts'),
        'schema-designer/main': path.resolve(__dirname, './src/schema-designer/main.ts'),
        'create-table/main': path.resolve(__dirname, './src/create-table/main.ts'),
        'drop-table/main': path.resolve(__dirname, './src/drop-table/main.ts'),
        'add-connection/main': path.resolve(__dirname, './src/add-connection/main.ts')
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        chunkFileNames: 'chunks/[name].js'
      }
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib')
    }
  }
});
