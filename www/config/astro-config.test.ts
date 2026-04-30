import { describe, expect, it } from 'vitest';

import astroConfig from '../astro.config.ts';

describe('astroConfig', () => {
  it('disables the Astro dev toolbar for remote forwarded development', () => {
    expect(astroConfig.devToolbar).toEqual({ enabled: false });
  });
});
