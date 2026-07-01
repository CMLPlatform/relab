import type { Href } from 'expo-router';

export function getProfileHref(username: string): Href {
  return `/profiles/${encodeURIComponent(username)}` as Href;
}
