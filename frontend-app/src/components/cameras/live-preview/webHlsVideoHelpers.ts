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

function safePlay(video: VideoLike) {
  Promise.resolve(video.play()).catch(() => {});
}

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
    safePlay(video);

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
      // Keep a slightly deeper buffer than the 200ms LL-HLS parts to absorb
      // typical jitter without pushing latency past ~2s. Back buffer stays
      // short to keep memory bounded on long-running sessions.
      backBufferLength: 6,
      maxBufferLength: 20,
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
