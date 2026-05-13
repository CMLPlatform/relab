import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const TOKEN_FRAGMENT_PARAM = 'token';

function webFragmentToken(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.hash.slice(1)).get(TOKEN_FRAGMENT_PARAM) ?? undefined;
}

function scrubWebFragment(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.hash) return;
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
}

export function useSensitiveAuthToken(routeToken: string | undefined): string | undefined {
  const [fragmentToken] = useState(webFragmentToken);

  useEffect(() => {
    scrubWebFragment();
  }, []);

  return fragmentToken ?? routeToken;
}
