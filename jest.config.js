const fs = require('fs');
const path = require('path');

const setupFiles = [];
if (fs.existsSync(path.resolve(__dirname, 'test', 'jest.setup.js'))) {
  setupFiles.push('<rootDir>/test/jest.setup.js');
}

module.exports = {
  transform: {
  '^.+\\.svelte$': ['svelte-jester', { preprocess: true, compilerOptions: { css: 'injected' } }],
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    '^.+\\.jsx?$': 'babel-jest'
  },
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: setupFiles,
  moduleFileExtensions: ['js', 'ts', 'svelte'],
  testPathIgnorePatterns: ['/node_modules/', '/out/', '/test/integration/'],
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@testing-library/svelte|svelte|svelte-.*|esm-env)/)'
  ]
};
