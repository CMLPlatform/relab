import { openURL } from 'expo-linking';

export async function openExternalUrl(value: string): Promise<boolean> {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    await openURL(url.toString());
    return true;
  } catch {
    return false;
  }
}
