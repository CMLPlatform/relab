import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
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

    const { result } = await renderHook(() => useAuthedMediaSource(URI));

    // expo-image's web path replaces the <img> with a credential-less fetch when
    // headers are present, which would drop the cookie and 401 a working request.
    expect(result.current).toEqual({ uri: URI });
    expect(result.current).not.toHaveProperty('headers');
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('attaches the bearer token on native, which has no cookie', async () => {
    mockIsWeb.mockReturnValue(false);

    const { result } = await renderHook(() => useAuthedMediaSource(URI));

    await waitFor(() =>
      expect(result.current).toEqual({
        uri: URI,
        headers: { Authorization: 'Bearer tok-123' },
      }),
    );
  });

  it('withholds the source on native until the token resolves', async () => {
    mockIsWeb.mockReturnValue(false);
    // Held pending on purpose: `renderHook` flushes every settled update before
    // it resolves, so a token that is already available would hide the very
    // state under test.
    let releaseToken: (token: string) => void = () => {};
    mockGetToken.mockReturnValue(
      new Promise<string>((resolve) => {
        releaseToken = resolve;
      }),
    );

    const { result } = await renderHook(() => useAuthedMediaSource(URI));

    // Rendering a source without credentials would fire a spurious onError and
    // latch the "failed" state before the token ever arrives.
    expect(result.current).toBeNull();

    await act(async () => {
      releaseToken('tok-123');
    });
    expect(result.current).toEqual({
      uri: URI,
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('keeps a stable source identity across re-renders', async () => {
    mockIsWeb.mockReturnValue(false);

    const { result, rerender } = await renderHook(() => useAuthedMediaSource(URI));
    await waitFor(() => expect(result.current).not.toBeNull());

    const first = result.current;
    await rerender({});

    // expo-image and expo-video key reloads off source identity: a new object each
    // render re-downloads the media on every render.
    expect(result.current).toBe(first);
  });

  it('returns null without a uri', async () => {
    mockIsWeb.mockReturnValue(false);

    const { result } = await renderHook(() => useAuthedMediaSource(null));

    expect(result.current).toBeNull();
  });
});
