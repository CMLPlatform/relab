import { Platform } from 'react-native';

const originalOS = Platform.OS;
const originalSelect = Platform.select;

// react-native's own Platform.select (Platform.ios.js) hardcodes `'ios' in spec`
// checks and ignores `Platform.OS` entirely, so mocking OS alone never changes
// what `Platform.select({ web: ... })` returns in Jest. Stub select() too so
// mockPlatform('web') actually resolves the web-only NativeWind variants that
// base primitives gate behind Platform.select — mirrors react-native-web's own
// `'web' in obj ? obj.web : obj.default` resolution.
export function mockPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'select', {
    value: (spec: Record<string, unknown>) => spec[os] ?? spec.native ?? spec.default,
    configurable: true,
  });
}

export function restorePlatform() {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  Object.defineProperty(Platform, 'select', { value: originalSelect, configurable: true });
}
