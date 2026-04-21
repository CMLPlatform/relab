import { describe, expect, it, jest } from '@jest/globals';
import { loadAnimatedBackground } from '@/app/layout/backgroundLoader';

describe('backgroundLoader', () => {
  it('returns the AnimatedBackground export from the loaded module', async () => {
    const AnimatedBackground = () => null;
    const importAnimatedBackgroundModule = jest.fn(async () => ({ AnimatedBackground }));

    await expect(loadAnimatedBackground(importAnimatedBackgroundModule)).resolves.toBe(
      AnimatedBackground,
    );
  });
});
