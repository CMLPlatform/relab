import { Platform } from 'react-native';

export function getFloatingPosition(): 'absolute' {
  return (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute';
}

export function getActiveStreamBannerBottomInset() {
  return Platform.OS === 'web' ? 16 : 88;
}

export function getStreamingSheetBottomPadding() {
  return Platform.OS === 'ios' ? 32 : 16;
}
