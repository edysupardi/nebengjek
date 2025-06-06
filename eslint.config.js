// eslint.config.js (ESLint v9.0+ format)
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';

export default [
  // Base recommended configurations
  js.configs.recommended,

  // Configuration for TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        node: true,
        jest: true,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettier,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': ['warn', { allow: ['constructors'] }],

      // General rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // Code style
      'max-len': ['warn', { code: 120 }],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },

  // Configuration for JavaScript files
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        node: true,
      },
    },
    plugins: {
      prettier: prettier,
    },
    rules: {
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'prettier/prettier': 'error',
    },
  },

  // Ignore patterns (replaces .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.log',
      '.DS_Store',
      '.vscode/**',
      '.husky/**',
      '*.config.js',
      'jest.config.js',
      'webpack.config.js',
    ],
  },

  // Apply prettier config to override conflicting rules
  prettierConfig,
];
