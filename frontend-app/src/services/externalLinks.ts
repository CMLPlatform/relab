import { openURL } from 'expo-linking';
import { normalizeHttpUrl } from '@/utils/urlSafety';

export async function openExternalUrl(value: string): Promise<boolean> {
  const url = normalizeHttpUrl(value);
  if (!url) {
    return false;
  }
  try {
    await openURL(url);
    return true;
  } catch {
    return false;
  }
}
