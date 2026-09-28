import { Platform } from 'react-native';

export function getFloatingPosition(): 'absolute' {
  return (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute';
}

/**
 * True when the web app runs inside another site's iframe (e.g. embedded in slides).
 * The session cookies are SameSite=Lax, so the browser never sends or stores them
 * there: signing in inside the frame cannot work and has to happen in a real tab.
 */
export function isFramed(): boolean {
  return Platform.OS === 'web' && window.self !== window.top;
}
