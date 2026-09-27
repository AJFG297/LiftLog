// oxlint-disable typescript/no-unsafe-call
const { defineConfig, globalIgnores } = require('eslint/config');

const reactCompiler = require('eslint-plugin-react-compiler');
const tsParser = require('@typescript-eslint/parser');

module.exports = defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-compiler': reactCompiler,
    },
    rules: {
      'react-compiler/react-compiler': 'error',
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    // The app's Hermes runtime has `Array.prototype.with` but not these ES2023 copying methods, and
    // neither typecheck (lib ESNext) nor the tests (Node) notice - a `toSorted` once hung startup.
    // Specs run on Node, so they may use them.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['toSorted', 'toSpliced', 'toReversed'].map((property) => ({
          property,
          message: 'Hermes lacks this; copy the array and use the mutating method (or filter/slice) instead.',
        })),
      ],
    },
  },
  globalIgnores([
    'plugins',
    '**/gen',
    '**/vitest.config.ts',
    '**/metro.config.js',
    '**/babel.config.js',
    '**/.eslintrc.js',
    '**/.eslint.config.js',
    '**/.env.local',
    '**/.expo',
    '**/expo-env.d.ts',
    '**/dist',
    '**/node_modules',
    'src/drizzle/migrations.js',
    'src/types/dom.slim.d.ts',
    'scripts',
  ]),
]);
