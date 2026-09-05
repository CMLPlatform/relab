import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
// NOTE: jest.spyOn needs the module's namespace object to patch `withRepeat` in place;
// a named import would just be a local binding and can't be spied on.
// biome-ignore lint/performance/noNamespaceImport: required for jest.spyOn to patch this export
import * as Reanimated from 'react-native-reanimated';
import { Skeleton } from '@/components/base/Skeleton';

describe('Skeleton', () => {
  it('gates the pulse loop behind the OS reduce-motion setting', () => {
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<Skeleton />);

    expect(withRepeatSpy).toHaveBeenCalledWith(
      expect.anything(),
      -1,
      false,
      undefined,
      Reanimated.ReduceMotion.System,
    );

    withRepeatSpy.mockRestore();
  });
});
