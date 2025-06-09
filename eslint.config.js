// eslint.config.js
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['**/dist/', '**/node_modules/', '**/.next/', '**/coverage/', '**/*.config.js'],
  },
  ...fixupConfigRules(
    compat.extends('@nestjs/eslint-config', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'),
  ),
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // ✅ Fix for NestJS constructor parameters
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none', // Ignore all function arguments (including constructor)
          varsIgnorePattern: '^_', // Allow variables starting with _
          argsIgnorePattern: '^_', // Allow arguments starting with _
          ignoreRestSiblings: true, // Ignore rest siblings in destructuring
          destructuredArrayIgnorePattern: '^_', // Allow destructured arrays starting with _
        },
      ],

      // ✅ Other common NestJS-friendly rules
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn', // Changed from error to warn
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/prefer-as-const': 'error',

      // ✅ Code style rules
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // ✅ Allow console.log in development (adjust as needed)
      'no-console': 'warn',

      // ✅ Async/await best practices
      'require-await': 'error',
      'no-return-await': 'error',
    },
  },

  // ✅ Specific overrides for different file types
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['**/*.controller.ts', '**/*.service.ts', '**/*.module.ts'],
    rules: {
      // These files commonly use constructor injection
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none', // Completely ignore constructor arguments
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
