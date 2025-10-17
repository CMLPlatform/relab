// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const eslintPluginJest = require('eslint-plugin-jest');
const eslintPluginTestingLibrary = require('eslint-plugin-testing-library');

module.exports = defineConfig([
  {
    ignores: ['**/.expo/**', '**/node_modules/**', '**/dist/**'],
  },

  // Base configs
  expoConfig,

  // Import organization
  {
    rules: {
      'import/order': 'error',
      'import/no-duplicates': 'error',
    },
  },

  // Prettier integration
  eslintPluginPrettierRecommended,

  // Test files configuration
  {
    ...eslintPluginJest.configs['flat/recommended'],
    ...eslintPluginTestingLibrary.configs['flat/react'],
    files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  },
]);
