import { getProfileHref } from '@/lib/router/profiles';

describe('profile routes', () => {
  it('builds encoded public profile hrefs', () => {
    expect(getProfileHref('alice')).toBe('/profiles/alice');
    expect(getProfileHref('a b')).toBe('/profiles/a%20b');
  });
});
