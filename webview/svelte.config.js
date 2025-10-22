import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use top-level await to dynamically import the ESM-only vite plugin and avoid
// duplicate-declaration issues when the plugin also imports this config.
const { vitePreprocess } = await import('@sveltejs/vite-plugin-svelte');

export default {
  preprocess: vitePreprocess({
    typescript: {
      tsconfigFile: path.resolve(__dirname, 'tsconfig.json')
    }
  }),
  compilerOptions: {
    dev: false
  }
};
