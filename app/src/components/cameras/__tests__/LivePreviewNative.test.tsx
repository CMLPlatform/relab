/**
 * Native LivePreview tests.
 *
 * Covers the null-return cases, platform routing, and the native
 * ``expo-video`` path end-to-end. The web path (``WebHlsVideo``) drives an
 * imperative ``<video>`` element and the dynamic ``hls.js`` import; testing
 * those internals requires a full jsdom environment with Fetch API polyfills
 * that would conflict with the project's MSW setup, so the web path stays
 * covered by manual browser testing instead. The goal here is to lock in
 * everything unit-testable in a node test env.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { LivePreview, PreviewErrorBoundary } from '@/components/cameras/LivePreview';
import { mockPlatform, renderWithProviders } from '@/test-utils/index';

// The relayed LL-HLS route is owner-checked; native sends a bearer token.
jest.mock('@/services/api/auth/authentication', () => ({
  getToken: () => Promise.resolve('test-token'),
}));

// ─── useCameraLivePreview mock ─────────────────────────────────────────────────

const mockUseCameraLivePreview = jest.fn();

jest.mock('@/features/cameras/rpi/hooks', () => ({
  useCameraLivePreview: (...args: unknown[]) => mockUseCameraLivePreview(...args),
}));

// ─── expo-video mock ───────────────────────────────────────────────────────────
//
// ``useVideoPlayer(url, setup)`` returns a player instance after invoking the
// setup callback against a fresh ``{ muted, loop, play }`` object. ``VideoView``
// renders as a ``View`` with a test id so we can assert on props.

const mockVideoPlayerInstance = {
  muted: false,
  loop: false,
  play: jest.fn(),
  release: jest.fn(),
  replaceAsync: jest.fn(() => Promise.resolve()),
  // NativeHlsVideo subscribes to `statusChange` via expo's useEvent.
  status: 'readyToPlay',
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
const mockUseVideoPlayer = jest.fn(
  (
    _url: string,
    setup?: (instance: {
      muted: boolean;
      loop: boolean;
      play: () => void;
      release: () => void;
    }) => void,
  ) => {
    if (setup) setup(mockVideoPlayerInstance);
    return mockVideoPlayerInstance;
  },
);

jest.mock('expo-video', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useVideoPlayer: (...args: unknown[]) =>
      mockUseVideoPlayer(...(args as Parameters<typeof mockUseVideoPlayer>)),
    VideoView: ({ contentFit }: { player: unknown; contentFit?: string }) =>
      actualReact.createElement(View, {
        testID: 'video-view',
        accessibilityHint: contentFit,
      }),
  };
});

// ─── Constants ─────────────────────────────────────────────────────────────────

const HLS_URL = 'https://cam.example/live/cam-1/index.m3u8';
const CAMERA = { id: 'cam-1' };
const LIVE_PREVIEW_PATTERN = /Live preview/i;
const PREVIEW_ERROR = /Couldn't load the preview/;

describe('LivePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform('ios');
    mockVideoPlayerInstance.muted = false;
    mockVideoPlayerInstance.loop = false;
    mockVideoPlayerInstance.status = 'readyToPlay';
    mockVideoPlayerInstance.release.mockReset();
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: HLS_URL });
  });

  // ── Null-return cases ──────────────────────────────────────────────────────

  it('returns null when camera is null', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={null} />);

    expect(screen.queryByText(LIVE_PREVIEW_PATTERN)).toBeNull();
  });

  it('returns null when enabled is false', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={CAMERA} enabled={false} />);

    expect(screen.queryByText(LIVE_PREVIEW_PATTERN)).toBeNull();
  });

  it('returns null when useCameraLivePreview yields a null hlsUrl even when enabled', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.queryByText(LIVE_PREVIEW_PATTERN)).toBeNull();
  });

  // ── Platform routing ──────────────────────────────────────────────────────

  it('renders the card caption on native (NativeHlsVideo path)', () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.getByText('Live preview · LL-HLS')).toBeOnTheScreen();
    expect(screen.getByTestId('video-view')).toBeOnTheScreen();
  });

  it('also renders the native path on android', () => {
    mockPlatform('android');

    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.getByTestId('video-view')).toBeOnTheScreen();
  });

  // ── Native path internals ──────────────────────────────────────────────────

  it('passes the hls URL and a setup callback to useVideoPlayer', async () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    // The bearer token resolves asynchronously, so the player is first created with
    // a null source and recreated once credentials are available (useVideoPlayer
    // keys its shared object on the serialized source).
    await waitFor(() => expect(mockUseVideoPlayer.mock.calls.at(-1)?.[0]).not.toBeNull());
    const call = mockUseVideoPlayer.mock.calls.at(-1);
    // The relayed HLS route is owner-checked and native has no session cookie, so
    // the player must send the bearer token itself.
    expect(call?.[0]).toEqual({
      uri: HLS_URL,
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(typeof call?.[1]).toBe('function');
  });

  it('configures the player as muted, non-looping, and auto-plays', () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    // useVideoPlayer invokes its setup callback against mockVideoPlayerInstance.
    expect(mockVideoPlayerInstance.muted).toBe(true);
    expect(mockVideoPlayerInstance.loop).toBe(false);
    expect(mockVideoPlayerInstance.play).toHaveBeenCalled();
  });

  it('renders VideoView with contentFit="contain"', () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    const videoView = screen.getByTestId('video-view');
    expect(videoView.props.accessibilityHint).toBe('contain');
  });

  // ── Status overlays ────────────────────────────────────────────────────────

  it('shows the loading overlay while the player is loading', () => {
    mockVideoPlayerInstance.status = 'loading';

    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.getByText('Loading preview…')).toBeOnTheScreen();
  });

  it('shows no overlay once the player is ready', () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.queryByText('Loading preview…')).toBeNull();
    expect(screen.queryByText(PREVIEW_ERROR)).toBeNull();
  });

  it('error overlay retry replaces the source and resumes playback', async () => {
    mockVideoPlayerInstance.status = 'error';

    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.getByText("Couldn't load the preview")).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Tap to retry'));
    expect(mockVideoPlayerInstance.replaceAsync).toHaveBeenCalled();
    // The setup callback also calls play() on each (re)render, so counts are
    // racy — the retry contract is that a play() FOLLOWS the replaceAsync.
    await waitFor(() => {
      const replaceOrder = mockVideoPlayerInstance.replaceAsync.mock.invocationCallOrder[0];
      const playOrders = mockVideoPlayerInstance.play.mock.invocationCallOrder;
      expect(playOrders.some((order) => order > replaceOrder)).toBe(true);
    });
  });

  // Regression: expo-video's useVideoPlayer releases the player itself on
  // unmount. Releasing it again here would double-release the native object.
  it('leaves the player release to useVideoPlayer on unmount', () => {
    const { unmount } = renderWithProviders(<LivePreview camera={CAMERA} />);

    unmount();

    expect(mockVideoPlayerInstance.release).not.toHaveBeenCalled();
  });

  it('shows a fallback when the preview player throws during render', () => {
    const ThrowingPreview = () => {
      throw new Error('boom');
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(
        <PreviewErrorBoundary>
          <ThrowingPreview />
        </PreviewErrorBoundary>,
      );

      expect(screen.getByText('Live preview unavailable')).toBeOnTheScreen();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('re-resolves hlsUrl when the camera prop changes', () => {
    const { rerender } = renderWithProviders(<LivePreview camera={{ id: 'cam-1' }} />);

    expect(mockUseCameraLivePreview).toHaveBeenCalledWith({ id: 'cam-1' }, { enabled: true });

    act(() => {
      rerender(<LivePreview camera={{ id: 'cam-2' }} />);
    });

    expect(mockUseCameraLivePreview).toHaveBeenCalledWith({ id: 'cam-2' }, { enabled: true });
  });
});
