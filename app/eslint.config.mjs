import * as tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const reactHooksErrors = Object.fromEntries(
  Object.keys(reactHooks.configs.flat['recommended-latest'].rules).map((ruleName) => [
    ruleName,
    'error',
  ]),
);

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: reactHooksErrors,
  },
  {
    files: ['src/**/*.{tsx,jsx}'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': 'error',
    },
  },
  {
    ignores: [
      '.expo/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'src/**/__tests__/**',
      'src/app/**/__tests__/**',
      'src/assets/data/*.json',
    ],
  },
]);
