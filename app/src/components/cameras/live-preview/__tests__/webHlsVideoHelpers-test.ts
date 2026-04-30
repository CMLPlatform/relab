import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setupWebHlsVideo } from '@/components/cameras/live-preview/webHlsVideoHelpers';

function createVideoMock(canPlayType = '') {
  const handlers = new Map<string, () => void>();

  return {
    handlers,
    addEventListener: jest.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    removeEventListener: jest.fn((event: string) => {
      handlers.delete(event);
    }),
    canPlayType: jest.fn(() => canPlayType),
    play: jest.fn(async () => undefined),
    load: jest.fn(),
    removeAttribute: jest.fn(),
    src: '',
    crossOrigin: undefined as string | undefined,
  };
}

describe('setupWebHlsVideo', () => {
  const markLive = jest.fn();
  const markError = jest.fn();
  const handleFatalError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configures native HLS playback and cleans up listeners', async () => {
    const video = createVideoMock('probably');

    const cleanup = await setupWebHlsVideo({
      video,
      src: 'https://cam.test/live.m3u8',
      withCredentials: true,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => false,
    });

    expect(video.crossOrigin).toBe('use-credentials');
    expect(video.src).toBe('https://cam.test/live.m3u8');
    expect(video.play).toHaveBeenCalled();

    video.handlers.get('playing')?.();
    expect(markLive).toHaveBeenCalled();

    video.handlers.get('error')?.();
    expect(handleFatalError).toHaveBeenCalledWith('HLS playback failed');

    cleanup();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
  });

  it('uses anonymous CORS for native HLS when credentials are disabled', async () => {
    const video = createVideoMock('maybe');

    await setupWebHlsVideo({
      video,
      src: 'https://cam.test/live.m3u8',
      withCredentials: false,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => false,
    });

    expect(video.crossOrigin).toBe('anonymous');
  });

  it('initializes hls.js playback and forwards fatal errors', async () => {
    const video = createVideoMock('');
    const hlsInstance = {
      loadSource: jest.fn(),
      attachMedia: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn(),
    };
    const Hls = Object.assign(
      jest.fn(() => hlsInstance),
      {
        isSupported: jest.fn(() => true),
        Events: { ERROR: 'hlsError' },
      },
    );

    const cleanup = await setupWebHlsVideo({
      video,
      src: 'https://cam.test/live.m3u8',
      withCredentials: true,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => false,
      importHls: async () => ({ default: Hls }) as never,
    });

    expect(Hls).toHaveBeenCalledWith(
      expect.objectContaining({
        lowLatencyMode: true,
        backBufferLength: 6,
        maxBufferLength: 20,
        xhrSetup: expect.any(Function),
      }),
    );
    expect(hlsInstance.loadSource).toHaveBeenCalledWith('https://cam.test/live.m3u8');
    expect(hlsInstance.attachMedia).toHaveBeenCalledWith(video);

    const onError = hlsInstance.on.mock.calls[0]?.[1] as
      | ((_event: unknown, data: { fatal: boolean; details?: string }) => void)
      | undefined;
    onError?.(null, { fatal: true, details: 'fatal boom' });
    expect(handleFatalError).toHaveBeenCalledWith('fatal boom');

    cleanup();
    expect(hlsInstance.destroy).toHaveBeenCalled();
  });

  it('marks unsupported browsers and import failures as errors', async () => {
    const unsupportedVideo = createVideoMock('');
    const UnsupportedHls = Object.assign(jest.fn(), {
      isSupported: jest.fn(() => false),
      Events: { ERROR: 'hlsError' },
    });

    await setupWebHlsVideo({
      video: unsupportedVideo,
      src: 'https://cam.test/live.m3u8',
      withCredentials: true,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => false,
      importHls: async () => ({ default: UnsupportedHls }) as never,
    });

    expect(markError).toHaveBeenCalledWith('Live preview is not supported in this browser.');

    const failingVideo = createVideoMock('');
    await setupWebHlsVideo({
      video: failingVideo,
      src: 'https://cam.test/live.m3u8',
      withCredentials: true,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => false,
      importHls: async () => {
        throw new Error('no hls');
      },
    });

    expect(markError).toHaveBeenCalledWith('Live preview unavailable');
  });

  it('avoids side effects after cancellation', async () => {
    const video = createVideoMock('');
    const Hls = Object.assign(jest.fn(), {
      isSupported: jest.fn(() => true),
      Events: { ERROR: 'hlsError' },
    });

    const cleanup = await setupWebHlsVideo({
      video,
      src: 'https://cam.test/live.m3u8',
      withCredentials: true,
      markLive,
      markError,
      handleFatalError,
      isCancelled: () => true,
      importHls: async () => ({ default: Hls }) as never,
    });

    expect(Hls).not.toHaveBeenCalled();
    cleanup();
    expect(video.removeEventListener).toHaveBeenCalledWith('playing', expect.any(Function));
  });
});
