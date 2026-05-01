import { getToken } from '../authentication';
import { apiFetch } from '../client';
import { getPublicProfile } from '../profiles';

jest.mock('../authentication');
jest.mock('../client');

const mockedGetToken = jest.mocked(getToken);
const mockedApiFetch = jest.mocked(apiFetch);

describe('getPublicProfile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns profile when api returns ok and includes auth header when token present', async () => {
    mockedGetToken.mockResolvedValue('token123');
    const profile = {
      username: 'alice',
      created_at: '2026-01-01T00:00:00Z',
      product_count: 2,
      total_weight_kg: 3,
      image_count: 0,
      top_category: 'cat',
    };

    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as unknown as Response);

    const result = await getPublicProfile('alice');
    expect(result).toEqual(profile);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/alice'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
      }),
    );
  });

  it('throws when response not ok', async () => {
    mockedGetToken.mockResolvedValue(undefined);
    mockedApiFetch.mockResolvedValue({ ok: false } as unknown as Response);

    await expect(getPublicProfile('bob')).rejects.toThrow('Profile not found');
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/bob'),
      expect.any(Object),
    );
  });

  it('encodes username in URL', async () => {
    mockedGetToken.mockResolvedValue(undefined);
    const profile = {
      username: 'a b',
      created_at: '',
      product_count: 0,
      total_weight_kg: 0,
      image_count: 0,
      top_category: '',
    };

    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as unknown as Response);

    const result = await getPublicProfile('a b');
    expect(result).toEqual(profile);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/profiles/${encodeURIComponent('a b')}`),
      expect.any(Object),
    );
  });
});
