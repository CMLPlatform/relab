// https://docs.expo.dev/guides/using-eslint/
import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginJest from 'eslint-plugin-jest';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginTestingLibrary from 'eslint-plugin-testing-library';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: [
      '**/.expo/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/types/api.ts', // Exclude generated API types
    ],
  },

  // Base configs
  ...expoConfig,
  eslintPluginPrettierRecommended,

  // Test files configuration
  {
    ...eslintPluginJest.configs['flat/recommended'],
    ...eslintPluginTestingLibrary.configs['flat/react'],
    files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  },
]);
