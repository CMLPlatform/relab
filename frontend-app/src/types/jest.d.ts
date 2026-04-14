import { JestNativeMatchers } from '@testing-library/jest-native/extend-expect';

declare module '@jest/expect' {
  interface Matchers<R extends void | Promise<void>> extends JestNativeMatchers<R> {}
}

declare module 'expect' {
  interface Matchers<R extends void | Promise<void>> extends JestNativeMatchers<R> {}
}

declare global {
  namespace jest {
    interface Matchers<R, T = unknown> extends JestNativeMatchers<R> {}
  }
}
