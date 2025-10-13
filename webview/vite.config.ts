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
    outDir: path.resolve(__dirname, '../media/data-editor'),
    emptyOutDir: true,
    assetsDir: '.',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: 'main[extname]',
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
