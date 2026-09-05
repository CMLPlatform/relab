import { fetchWithAuth } from '@/services/api/auth/authentication';
import { getPublicProfile } from '@/services/api/profiles';

jest.mock('@/services/api/auth/authentication');

const mockedFetchWithAuth = jest.mocked(fetchWithAuth);

describe('getPublicProfile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns profile when api returns ok', async () => {
    const profile = {
      username: 'alice',
      created_at: '2026-01-01T00:00:00Z',
      product_count: 2,
      total_weight_kg: 3,
      image_count: 0,
      top_category: 'cat',
    };

    mockedFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as unknown as Response);

    const result = await getPublicProfile('alice');
    expect(result).toEqual(profile);
    expect(mockedFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/alice'),
      expect.any(Object),
    );
  });

  it('throws an ApiError carrying the status when response not ok', async () => {
    mockedFetchWithAuth.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Profile not found' }),
    } as unknown as Response);

    await expect(getPublicProfile('bob')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Profile not found',
    });
  });

  it('encodes username in URL', async () => {
    const profile = {
      username: 'a b',
      created_at: null,
      product_count: 0,
      total_weight_kg: 0,
      image_count: 0,
      top_category: '',
    };

    mockedFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => profile,
    } as unknown as Response);

    const result = await getPublicProfile('a b');
    expect(result).toEqual(profile);
    expect(mockedFetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining(`/profiles/${encodeURIComponent('a b')}`),
      expect.any(Object),
    );
  });
});
