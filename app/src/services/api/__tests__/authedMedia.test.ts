import { describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuthedMediaSource } from '@/services/api/authedMedia';

const mockGetToken = jest.fn<() => Promise<string | undefined>>();
const mockIsWeb = jest.fn<() => boolean>();

jest.mock('@/services/api/auth/authentication', () => ({
  getToken: () => mockGetToken(),
}));
jest.mock('@/services/storage', () => ({
  isWeb: () => mockIsWeb(),
}));

const URI = 'https://api.example.org/v1/plugins/rpi-cam/cameras/cam-1/preview-thumbnail?v=1';

beforeEach(() => {
  mockGetToken.mockReset();
  mockIsWeb.mockReset();
  mockGetToken.mockResolvedValue('tok-123');
});

describe('useAuthedMediaSource', () => {
  it('sends no Authorization header on web, where the session cookie authenticates', async () => {
    mockIsWeb.mockReturnValue(true);

    const { result } = renderHook(() => useAuthedMediaSource(URI));

    // expo-image's web path replaces the <img> with a credential-less fetch when
    // headers are present, which would drop the cookie and 401 a working request.
    expect(result.current).toEqual({ uri: URI });
    expect(result.current).not.toHaveProperty('headers');
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('attaches the bearer token on native, which has no cookie', async () => {
    mockIsWeb.mockReturnValue(false);

    const { result } = renderHook(() => useAuthedMediaSource(URI));

    await waitFor(() =>
      expect(result.current).toEqual({
        uri: URI,
        headers: { Authorization: 'Bearer tok-123' },
      }),
    );
  });

  it('withholds the source on native until the token resolves', () => {
    mockIsWeb.mockReturnValue(false);

    const { result } = renderHook(() => useAuthedMediaSource(URI));

    // Rendering a source without credentials would fire a spurious onError and
    // latch the "failed" state before the token ever arrives.
    expect(result.current).toBeNull();
  });

  it('keeps a stable source identity across re-renders', async () => {
    mockIsWeb.mockReturnValue(false);

    const { result, rerender } = renderHook(() => useAuthedMediaSource(URI));
    await waitFor(() => expect(result.current).not.toBeNull());

    const first = result.current;
    rerender({});

    // expo-image and expo-video key reloads off source identity: a new object each
    // render re-downloads the media on every render.
    expect(result.current).toBe(first);
  });

  it('returns null without a uri', () => {
    mockIsWeb.mockReturnValue(false);

    const { result } = renderHook(() => useAuthedMediaSource(null));

    expect(result.current).toBeNull();
  });
});
