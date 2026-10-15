import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'Agent/', 'node_modules/', 'e2e/results/', 'e2e/fixtures/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser }
  },
  {
    files: ['tests/**/*.js', 'e2e/**/*.mjs', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  }
];
