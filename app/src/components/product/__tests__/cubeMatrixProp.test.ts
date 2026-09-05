import { describe, expect, it, jest } from '@jest/globals';

// react-native-svg's animated faces are driven through Reanimated's
// animated-prop path, which writes prop keys verbatim and skips the JS
// transform→matrix conversion. The native views only read `matrix`; the web
// renderer only reads `transform`. Nothing in a rendered tree shows this —
// jest's Reanimated mock never applies animatedProps — so the key choice is
// asserted directly.
//
// NOTE: on-device verification of the native path is still pending.
function loadMatrixProp(os: 'web' | 'ios') {
  let matrixProp!: typeof import('@/components/product/cubeLayout')['matrixProp'];
  jest.isolateModules(() => {
    jest.doMock('react-native', () => {
      const actual = jest.requireActual<typeof import('react-native')>('react-native');
      // Proxy, not a spread: react-native's exports are lazy getters and
      // copying them all eagerly pulls in native modules jest has no binary for.
      return new Proxy(actual, {
        get: (target, key) =>
          key === 'Platform' ? { ...target.Platform, OS: os } : target[key as keyof typeof target],
      });
    });
    matrixProp = require('@/components/product/cubeLayout').matrixProp;
  });
  return matrixProp;
}

const M = [1, 0.5, 0, 1, 4, 8] as const;

describe('cubeLayout matrixProp', () => {
  it('uses the native `matrix` prop name off web', () => {
    expect(loadMatrixProp('ios')([...M] as never)).toEqual({ matrix: [...M] });
  });

  it('uses `transform` on web, the only key the web renderer understands', () => {
    expect(loadMatrixProp('web')([...M] as never)).toEqual({ transform: [...M] });
  });
});
