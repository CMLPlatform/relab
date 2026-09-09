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
const reactNativeA11yRules = {
  'react-native-a11y/has-valid-accessibility-role': 'error',
  'react-native-a11y/has-valid-accessibility-state': 'error',
  'react-native-a11y/has-valid-accessibility-value': 'error',
  'react-native-a11y/has-valid-accessibility-actions': 'error',
  'react-native-a11y/has-valid-accessibility-live-region': 'error',
  'react-native-a11y/has-valid-important-for-accessibility': 'error',
  'react-native-a11y/no-nested-touchables': 'error',
  'react-native-a11y/has-valid-accessibility-descriptors': 'error',
  'react-native-a11y/has-valid-accessibility-ignores-invert-colors': 'error',
};

// A heading role written straight onto a JSX element, which `heading(level)`
// from `@/utils/a11y` exists to replace: react-native-web renders any header
// role without an aria-level as an <h1>, so a bare one silently claims the
// screen's only top-level heading — the one useScreenEntryFocus focuses.
const headingRole = (prop, value) => ({
  selector: `JSXAttribute[name.name="${prop}"][value.value="${value}"]`,
  message: "Spread heading(level) from '@/utils/a11y' instead of a bare heading role.",
});

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
    rules: {
      ...reactHooksErrors,
      ...reactNativeA11yRules,
      'no-restricted-syntax': [
        'error',
        headingRole('accessibilityRole', 'header'),
        headingRole('role', 'heading'),
      ],
    },
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
    // Vendored react-native-reusables (shadcn-style) primitives export cva variant
    // constants alongside their component by design; not hand-refactored.
    files: ['src/components/base/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
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
