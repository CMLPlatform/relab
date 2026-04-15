export type LocalConnectionMode = 'probing' | 'local' | 'relay';

export interface LocalConnectionState {
  mode: LocalConnectionMode;
  localBaseUrl: string | null;
  localMediaUrl: string | null;
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
    localMediaUrl: null,
    localApiKey: null,
    isInitializing: true,
  };
}

export function normalizeLocalConnectionUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
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
      const { localBaseUrl, localApiKey } = action.payload;
      return {
        ...state,
        localBaseUrl,
        localMediaUrl: deriveLocalMediaUrl(localBaseUrl),
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
        localMediaUrl: deriveLocalMediaUrl(localBaseUrl),
        localApiKey: action.payload.localApiKey,
      };
    }
    case 'clear':
      return {
        ...state,
        mode: 'relay',
        localBaseUrl: null,
        localMediaUrl: null,
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
