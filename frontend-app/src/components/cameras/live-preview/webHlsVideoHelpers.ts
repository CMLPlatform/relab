type VideoLike = {
  addEventListener: (event: string, handler: () => void) => void;
  removeEventListener: (event: string, handler: () => void) => void;
  canPlayType: (type: string) => string;
  play: () => Promise<void> | void;
  load: () => void;
  removeAttribute: (name: string) => void;
  src?: string;
  crossOrigin?: string | null;
};

type HlsLike = {
  loadSource: (src: string) => void;
  attachMedia: (video: unknown) => void;
  on: (
    event: string,
    handler: (_event: unknown, data: { fatal: boolean; details?: string }) => void,
  ) => void;
  destroy: () => void;
};

type HlsConstructor = {
  new (config: {
    lowLatencyMode: boolean;
    backBufferLength: number;
    maxBufferLength: number;
    xhrSetup?: (xhr: { withCredentials?: boolean }) => void;
  }): HlsLike;
  isSupported: () => boolean;
  Events: { ERROR: string };
};

export async function setupWebHlsVideo({
  video,
  src,
  withCredentials,
  markLive,
  markError,
  handleFatalError,
  isCancelled,
  importHls = () =>
    import('hls.js') as Promise<{
      default: HlsConstructor;
    }>,
}: {
  video: VideoLike;
  src: string;
  withCredentials: boolean;
  markLive: () => void;
  markError: (message: string) => void;
  handleFatalError: (message: string) => void;
  isCancelled: () => boolean;
  importHls?: () => Promise<{ default: HlsConstructor }>;
}): Promise<() => void> {
  const onPlaying = () => {
    if (!isCancelled()) {
      markLive();
    }
  };
  video.addEventListener('playing', onPlaying);

  const removePlayingListener = () => {
    video.removeEventListener('playing', onPlaying);
  };

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.crossOrigin = withCredentials ? 'use-credentials' : 'anonymous';
    video.src = src;
    void Promise.resolve(video.play()).catch(() => {});

    const onError = () => {
      if (!isCancelled()) {
        handleFatalError('HLS playback failed');
      }
    };
    video.addEventListener('error', onError);

    return () => {
      removePlayingListener();
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    };
  }

  try {
    const { default: Hls } = await importHls();
    if (isCancelled()) {
      removePlayingListener();
      return removePlayingListener;
    }

    if (!Hls.isSupported()) {
      markError('Live preview is not supported in this browser.');
      return removePlayingListener;
    }

    const hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 4,
      maxBufferLength: 4,
      xhrSetup: withCredentials
        ? (xhr) => {
            xhr.withCredentials = true;
          }
        : undefined,
    });

    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && !isCancelled()) {
        handleFatalError(data.details ?? 'HLS playback failed');
      }
    });

    return () => {
      removePlayingListener();
      hls.destroy();
    };
  } catch {
    if (!isCancelled()) {
      markError('Live preview unavailable');
    }
    return removePlayingListener;
  }
}
