import type { Href } from 'expo-router';

export function getProfileHref(username: string): Href {
  return `/users/${encodeURIComponent(username)}` as Href;
}
