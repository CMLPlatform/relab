import { Platform } from 'react-native';

const originalOS = Platform.OS;

export function mockPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

export function restorePlatform() {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
}
