import { normalizeHttpUrl } from '@/utils/urlSafety';

export type LocalConnectionMode = 'probing' | 'local' | 'relay';
const TRAILING_SLASHES_PATTERN = /\/+$/;

export interface LocalConnectionState {
  mode: LocalConnectionMode;
  localBaseUrl: string | null;
  localApiKey: string | null;
  isInitializing: boolean;
}

export type LocalConnectionAction =
  | {
      type: 'restore';
      payload: {
        localBaseUrl: string | null;
        localApiKey: string | null;
      };
    }
  | {
      type: 'setMode';
      payload: LocalConnectionMode;
    }
  | {
      type: 'activate';
      payload: {
        localBaseUrl: string;
        localApiKey: string;
      };
    }
  | {
      type: 'clear';
    }
  | {
      type: 'finishInitialization';
    };

export function createInitialLocalConnectionState(): LocalConnectionState {
  return {
    mode: 'probing',
    localBaseUrl: null,
    localApiKey: null,
    isInitializing: true,
  };
}

export function normalizeLocalConnectionUrl(baseUrl: string): string {
  const normalized = normalizeHttpUrl(baseUrl)?.replace(TRAILING_SLASHES_PATTERN, '');
  if (!normalized) {
    throw new Error('Local camera connection URL must be an http(s) URL.');
  }
  return normalized;
}

export function deriveLocalMediaUrl(baseUrl: string | null): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(baseUrl);
    url.port = '8888';
    return url.origin;
  } catch {
    return baseUrl.replace(':8018', ':8888');
  }
}

export function localConnectionReducer(
  state: LocalConnectionState,
  action: LocalConnectionAction,
): LocalConnectionState {
  switch (action.type) {
    case 'restore': {
      const { localApiKey } = action.payload;
      // Re-validate the persisted URL; a tampered/legacy value must not reach the
      // HLS player or a keyed fetch just because it came from storage.
      let localBaseUrl: string | null = null;
      try {
        localBaseUrl = action.payload.localBaseUrl
          ? normalizeLocalConnectionUrl(action.payload.localBaseUrl)
          : null;
      } catch {
        localBaseUrl = null;
      }
      return {
        ...state,
        localBaseUrl,
        localApiKey,
      };
    }
    case 'setMode':
      return {
        ...state,
        mode: action.payload,
      };
    case 'activate': {
      const localBaseUrl = normalizeLocalConnectionUrl(action.payload.localBaseUrl);
      return {
        ...state,
        mode: 'local',
        localBaseUrl,
        localApiKey: action.payload.localApiKey,
      };
    }
    case 'clear':
      return {
        ...state,
        mode: 'relay',
        localBaseUrl: null,
        localApiKey: null,
      };
    case 'finishInitialization':
      return {
        ...state,
        isInitializing: false,
      };
    default:
      return state;
  }
}
