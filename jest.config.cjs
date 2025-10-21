const path = require('path');

module.exports = {
  transform: {
  '^.+\.svelte$': ['svelte-jester', { preprocess: path.resolve(__dirname, 'svelte.config.cjs'), compilerOptions: { css: 'injected' } }],
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json', useESM: true }],
    '^.+\.jsx?$': 'babel-jest',
    '^.+\.mjs$': 'babel-jest'
  },
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
  moduleFileExtensions: ['js', 'ts', 'svelte'],
  // Prefer resolving modules from the webview package first so the Svelte
  // compiler/runtime used by tests matches the components under test.
  moduleDirectories: ['<rootDir>/webview/node_modules', 'node_modules'],
  testPathIgnorePatterns: ['/node_modules/', '/out/', '/test/integration/'],
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@testing-library/svelte|svelte|svelte-.*|esm-env)/)'
  ],
  moduleNameMapper: {
    // Provide both ESM and CJS manual mocks; the ESM build will import the .mjs file while
    // older CJS resolution will use the .cjs mock. Jest will pick the appropriate file
    // based on how the test environment resolves modules in ESM mode.
  // Use a thin CJS wrapper so Jest always gets a synchronous CommonJS
  // export regardless of whether tests run under ESM or CJS.
  // Map 'vscode' to the TypeScript mock so ESM-mode tests receive proper
  // named exports (EventEmitter, ViewColumn, window, etc.). ts-jest will
  // transform the .ts mock into the correct shape for tests running with
  // useESM: true.
  '^vscode$': '<rootDir>/test/__mocks__/vscode.ts',
  '^\\$lib/(.*)$': '<rootDir>/webview/src/lib/$1',
  '^svelte/internal/flags/legacy$': '<rootDir>/test/__mocks__/svelte-internal-flags-legacy.mjs',
  '^svelte$': '<rootDir>/webview/node_modules/svelte/src/runtime/index.js',
  '^svelte/compiler$': '<rootDir>/webview/node_modules/svelte/src/compiler/index.js',
  '^svelte/internal$': '<rootDir>/webview/node_modules/svelte/src/runtime/internal/index.js',
    '^svelte-focus-trap$': '<rootDir>/test/__mocks__/svelte-focus-trap.svelte'
    ,
    '^pg$': '<rootDir>/test/__mocks__/pg.cjs'
  },
  // Treat TypeScript and Svelte files as ESM so transformers receive ESM source
  // Note: .mjs is always treated as ESM by Node/Jest and must not be listed here.
  extensionsToTreatAsEsm: ['.ts', '.svelte']
};
