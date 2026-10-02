import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * VoiceOver ignores `accessibilityLiveRegion` and `aria-live`; render this
 * inside a live region to announce the region's text explicitly on iOS.
 * `skipInitial` matches a live region's own rule: content present when the
 * region mounts is not announced, only later changes.
 */
export function IosAnnouncement({
  text,
  skipInitial = false,
}: {
  text?: string;
  skipInitial?: boolean;
}) {
  // The mount-time text, held until it first changes. A value, not a "mounted"
  // flag, so StrictMode's double effect run cannot announce it.
  const quiet = useRef(skipInitial ? text : undefined);
  useEffect(() => {
    if (quiet.current !== undefined) {
      if (text === quiet.current) return;
      quiet.current = undefined;
    }
    if (text && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  return null;
}
