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
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/db/helpers.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'MemberExpression[computed=false][property.name="transaction"]',
          'MemberExpression[computed=true][property.value="transaction"]',
          'MemberExpression[computed=true][property.type="TemplateLiteral"][property.expressions.length=0][property.quasis.0.value.cooked="transaction"]',
          'ObjectPattern > Property[computed=false][key.name="transaction"]',
          'ObjectPattern > Property[key.value="transaction"]',
          'ObjectPattern > Property[computed=true][key.type="TemplateLiteral"][key.expressions.length=0][key.quasis.0.value.cooked="transaction"]',
        ].map((selector) => ({
          selector,
          message: 'Use writeAtomically from @/db/helpers. Device transactions are synchronous.',
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
