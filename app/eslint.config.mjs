import * as tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNativeA11y from 'eslint-plugin-react-native-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';

const reactHooksErrors = Object.fromEntries(
  Object.keys(reactHooks.configs.flat['recommended-latest'].rules).map((ruleName) => [
    ruleName,
    'error',
  ]),
);

// High-signal RN accessibility rules — catch malformed accessibility props on
// native primitives that Biome's DOM-oriented a11y rules can't see. This runs
// in the existing lint lane (every PR), covering the app's a11y gap that the
// axe-on-web e2e only reaches post-merge. The codebase already passes these,
// so they gate regressions at zero churn.
//
// Deliberately omitted:
//  - Legacy pre-RN-0.57 rules (accessibility-traits/states/component-type):
//    never fire on modern code.
//  - has-accessibility-hint / has-accessibility-props: prescriptive, flood
//    without catching real defects.
//  - has-valid-accessibility-descriptors: currently flags 38 interactive
//    elements missing a role/label. Real a11y debt worth a dedicated pass —
//    enabling it here would either block the gate or force an unreviewed
//    mass-edit. NOTE: turn on once those elements are labelled.
//  - has-valid-accessibility-ignores-invert-colors: 5 images; minor iOS
//    Smart-Invert nicety, low priority for this app. NOTE: revisit with the
//    descriptors pass above.
const reactNativeA11yRules = {
  'react-native-a11y/has-valid-accessibility-role': 'error',
  'react-native-a11y/has-valid-accessibility-state': 'error',
  'react-native-a11y/has-valid-accessibility-value': 'error',
  'react-native-a11y/has-valid-accessibility-actions': 'error',
  'react-native-a11y/has-valid-accessibility-live-region': 'error',
  'react-native-a11y/has-valid-important-for-accessibility': 'error',
  'react-native-a11y/no-nested-touchables': 'error',
};

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-native-a11y': reactNativeA11y,
    },
    rules: { ...reactHooksErrors, ...reactNativeA11yRules },
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
