import { Platform } from 'react-native';

const originalOS = Platform.OS;
const originalSelect = Platform.select;

// react-native's own Platform.select (Platform.ios.js) hardcodes `'ios' in spec`
// checks and ignores `Platform.OS` entirely, so mocking OS alone never changes
// what `Platform.select({ web: ... })` returns in Jest. Stub select() too so
// mockPlatform('web') actually resolves the web-only NativeWind variants that
// base primitives gate behind Platform.select. Mirror each platform's REAL
// resolution: react-native-web's web select has no `native` key concept
// (`'web' in spec ? spec.web : spec.default`), whereas native falls back
// through `native` then `default`.
export function mockPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  const select = <T>(spec: { [k: string]: T }): T | undefined =>
    os === 'web'
      ? 'web' in spec
        ? spec.web
        : spec.default
      : os in spec
        ? spec[os]
        : 'native' in spec
          ? spec.native
          : spec.default;
  Object.defineProperty(Platform, 'select', { value: select, configurable: true });
}

export function restorePlatform() {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  Object.defineProperty(Platform, 'select', { value: originalSelect, configurable: true });
}
