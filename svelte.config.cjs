const sveltePreprocess = require('svelte-preprocess');

module.exports = {
  preprocess: sveltePreprocess({ typescript: true }),
  compilerOptions: {
    dev: false,
    css: 'injected'
  }
};
