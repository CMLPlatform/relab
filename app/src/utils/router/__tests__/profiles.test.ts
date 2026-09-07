import { getProfileHref } from '@/utils/router/profiles';

describe('profile routes', () => {
  it('builds encoded public profile hrefs', () => {
    expect(getProfileHref('alice')).toBe('/users/alice');
    expect(getProfileHref('a b')).toBe('/users/a%20b');
  });
});
