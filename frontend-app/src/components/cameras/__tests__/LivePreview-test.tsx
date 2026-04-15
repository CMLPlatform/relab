/**
 * LivePreview tests.
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
import { act, screen } from '@testing-library/react-native';
import { mockPlatform, renderWithProviders } from '@/test-utils';
import { LivePreview, PreviewErrorBoundary } from '../LivePreview';

// ─── useCameraLivePreview mock ─────────────────────────────────────────────────

const mockUseCameraLivePreview = jest.fn();

jest.mock('@/hooks/useRpiCameras', () => ({
  useCameraLivePreview: (...args: unknown[]) => mockUseCameraLivePreview(...args),
}));

// ─── expo-video mock ───────────────────────────────────────────────────────────
//
// ``useVideoPlayer(url, setup)`` returns a player instance after invoking the
// setup callback against a fresh ``{ muted, loop, play }`` object. ``VideoView``
// renders as a ``View`` with a test id so we can assert on props.

const mockVideoPlayerInstance = { muted: false, loop: false, play: jest.fn(), release: jest.fn() };
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

describe('LivePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform('ios');
    mockVideoPlayerInstance.muted = false;
    mockVideoPlayerInstance.loop = false;
    mockVideoPlayerInstance.release.mockReset();
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: HLS_URL });
  });

  // ── Null-return cases ──────────────────────────────────────────────────────

  it('returns null when camera is null', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={null} />);

    expect(screen.queryByText(/Live preview/i)).toBeNull();
  });

  it('returns null when enabled is false', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={CAMERA} enabled={false} />);

    expect(screen.queryByText(/Live preview/i)).toBeNull();
  });

  it('returns null when useCameraLivePreview yields a null hlsUrl even when enabled', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null });

    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(screen.queryByText(/Live preview/i)).toBeNull();
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

  it('passes the hls URL and a setup callback to useVideoPlayer', () => {
    renderWithProviders(<LivePreview camera={CAMERA} />);

    expect(mockUseVideoPlayer).toHaveBeenCalledTimes(1);
    const call = mockUseVideoPlayer.mock.calls[0];
    expect(call?.[0]).toBe(HLS_URL);
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

  it('releases the native player on unmount', () => {
    const { unmount } = renderWithProviders(<LivePreview camera={CAMERA} />);

    unmount();

    expect(mockVideoPlayerInstance.release).toHaveBeenCalledTimes(1);
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
