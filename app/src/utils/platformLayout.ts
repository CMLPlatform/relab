import { Platform, type TextStyle } from 'react-native';

/** Cross-platform text glow: web wants the CSS shorthand, native the RN props. */
export function textGlow(color: string, radius = 5): TextStyle {
  return Platform.OS === 'web'
    ? ({ textShadow: `0px 0px ${radius}px ${color}` } as TextStyle)
    : {
        textShadowColor: color,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: radius,
      };
}

export function getFloatingPosition(): 'absolute' {
  return (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute';
}

export function getActiveStreamBannerBottomInset() {
  return Platform.OS === 'web' ? 16 : 88;
}

export function getStreamingSheetBottomPadding() {
  return Platform.OS === 'ios' ? 32 : 16;
}
