import {
  isPrivateLocalHost,
  normalizeHttpUrl,
  parseAbsoluteUrl,
  stripTrailingSlash,
} from '@/utils/urlSafety';

export type LocalConnectionMode = 'probing' | 'local' | 'relay';

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

/**
 * Normalize and validate a local camera base URL.
 *
 * The single chokepoint for every path that probes, persists, or restores a
 * local URL, so the device API key can never be attached to a host off the LAN
 * — whether that host came from the backend, from the user, or from storage.
 */
export function normalizeLocalConnectionUrl(baseUrl: string): string {
  const normalized = normalizeHttpUrl(baseUrl);
  const url = normalized ? parseAbsoluteUrl(normalized) : null;
  if (!normalized || !url || !isPrivateLocalHost(url.hostname)) {
    throw new Error('Local camera connection URL must be an http(s) URL on the local network.');
  }
  return stripTrailingSlash(normalized);
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
