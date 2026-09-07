import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setupWebHlsVideo } from '@/components/cameras/live-preview/webHlsVideoHelpers';

type HlsErrorHandler = (
  _event: unknown,
  data: { fatal: boolean; type?: string; details?: string },
) => void;

const ERROR_TYPES = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };

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

function createHlsMock() {
  const hlsInstance = {
    loadSource: jest.fn(),
    attachMedia: jest.fn(),
    on: jest.fn(),
    startLoad: jest.fn(),
    recoverMediaError: jest.fn(),
    destroy: jest.fn(),
  };
  const Hls = Object.assign(
    jest.fn(() => hlsInstance),
    {
      isSupported: jest.fn(() => true),
      Events: { ERROR: 'hlsError' },
      ErrorTypes: ERROR_TYPES,
    },
  );
  return { Hls, hlsInstance };
}

function errorHandlerOf(hlsInstance: ReturnType<typeof createHlsMock>['hlsInstance']) {
  return hlsInstance.on.mock.calls[0]?.[1] as HlsErrorHandler;
}

describe('setupWebHlsVideo', () => {
  const markLive = jest.fn();
  const markError = jest.fn();

  type Opts = Parameters<typeof setupWebHlsVideo>[0];
  const hlsOpts = (video: Opts['video'], over: Partial<Opts> = {}): Opts => ({
    video,
    src: 'https://cam.test/live.m3u8',
    withCredentials: true,
    markLive,
    markError,
    isCancelled: () => false,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configures native HLS playback and cleans up listeners', async () => {
    const video = createVideoMock('probably');

    const cleanup = await setupWebHlsVideo(hlsOpts(video));

    expect(video.crossOrigin).toBe('use-credentials');
    expect(video.src).toBe('https://cam.test/live.m3u8');
    expect(video.play).toHaveBeenCalled();

    video.handlers.get('playing')?.();
    expect(markLive).toHaveBeenCalled();

    video.handlers.get('error')?.();
    expect(markError).toHaveBeenCalledWith('HLS playback failed');

    cleanup();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
  });

  it('uses anonymous CORS for native HLS when credentials are disabled', async () => {
    const video = createVideoMock('maybe');

    await setupWebHlsVideo(
      hlsOpts(video, {
        withCredentials: false,
      }),
    );

    expect(video.crossOrigin).toBe('anonymous');
  });

  it('initializes hls.js playback with the low-latency buffer config', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    const cleanup = await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );

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

    cleanup();
    expect(hlsInstance.destroy).toHaveBeenCalled();
  });

  it('ignores non-fatal errors, which hls.js retries internally', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );

    errorHandlerOf(hlsInstance)(null, { fatal: false, type: ERROR_TYPES.NETWORK_ERROR });

    expect(hlsInstance.startLoad).not.toHaveBeenCalled();
    expect(markError).not.toHaveBeenCalled();
  });

  it('recovers once from a fatal network error, then surfaces the second', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );
    const onError = errorHandlerOf(hlsInstance);

    onError(null, { fatal: true, type: ERROR_TYPES.NETWORK_ERROR, details: 'manifestLoadError' });
    expect(hlsInstance.startLoad).toHaveBeenCalledTimes(1);
    expect(markError).not.toHaveBeenCalled();

    onError(null, { fatal: true, type: ERROR_TYPES.NETWORK_ERROR, details: 'manifestLoadError' });
    expect(hlsInstance.startLoad).toHaveBeenCalledTimes(1);
    expect(markError).toHaveBeenCalledWith('manifestLoadError');
  });

  it('recovers once from a fatal media error, then surfaces the second', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );
    const onError = errorHandlerOf(hlsInstance);

    onError(null, { fatal: true, type: ERROR_TYPES.MEDIA_ERROR, details: 'bufferStalledError' });
    expect(hlsInstance.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(markError).not.toHaveBeenCalled();

    onError(null, { fatal: true, type: ERROR_TYPES.MEDIA_ERROR, details: 'bufferStalledError' });
    expect(hlsInstance.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(markError).toHaveBeenCalledWith('bufferStalledError');
  });

  it('allows a fresh recovery attempt once playback resumes', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );
    const onError = errorHandlerOf(hlsInstance);

    onError(null, { fatal: true, type: ERROR_TYPES.NETWORK_ERROR });
    video.handlers.get('playing')?.();
    onError(null, { fatal: true, type: ERROR_TYPES.NETWORK_ERROR });

    expect(hlsInstance.startLoad).toHaveBeenCalledTimes(2);
    expect(markError).not.toHaveBeenCalled();
  });

  it('surfaces fatal errors it cannot recover from', async () => {
    const video = createVideoMock('');
    const { Hls, hlsInstance } = createHlsMock();

    await setupWebHlsVideo(
      hlsOpts(video, {
        importHls: async () => ({ default: Hls }) as never,
      }),
    );

    errorHandlerOf(hlsInstance)(null, { fatal: true, type: 'muxError', details: 'fatal boom' });

    expect(markError).toHaveBeenCalledWith('fatal boom');
    expect(hlsInstance.startLoad).not.toHaveBeenCalled();
    expect(hlsInstance.recoverMediaError).not.toHaveBeenCalled();
  });

  it('marks unsupported browsers and import failures as errors', async () => {
    const unsupportedVideo = createVideoMock('');
    const UnsupportedHls = Object.assign(jest.fn(), {
      isSupported: jest.fn(() => false),
      Events: { ERROR: 'hlsError' },
      ErrorTypes: ERROR_TYPES,
    });

    await setupWebHlsVideo(
      hlsOpts(unsupportedVideo, {
        importHls: async () => ({ default: UnsupportedHls }) as never,
      }),
    );

    expect(markError).toHaveBeenCalledWith('Live preview is not supported in this browser.');

    const failingVideo = createVideoMock('');
    await setupWebHlsVideo(
      hlsOpts(failingVideo, {
        importHls: async () => {
          throw new Error('no hls');
        },
      }),
    );

    expect(markError).toHaveBeenCalledWith('Live preview unavailable');
  });

  it('avoids side effects after cancellation', async () => {
    const video = createVideoMock('');
    const { Hls } = createHlsMock();

    const cleanup = await setupWebHlsVideo(
      hlsOpts(video, {
        isCancelled: () => true,
        importHls: async () => ({ default: Hls }) as never,
      }),
    );

    expect(Hls).not.toHaveBeenCalled();
    cleanup();
    expect(video.removeEventListener).toHaveBeenCalledWith('playing', expect.any(Function));
  });
});
