import { onlineManager } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ReduceMotion } from 'react-native-reanimated';
import { AppText } from './AppText';

const OFFLINE_MESSAGE = "Offline — your captures will send when you're back online";

/** Persistent strip stating the offline contract: nothing is lost, sends resume on reconnect. */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );

  // accessibilityLiveRegion below is Android-only (plus aria-live on the web
  // export); VoiceOver needs the transition announced explicitly, same split
  // as DialogProvider's Toast.
  useEffect(() => {
    if (!isOnline && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(OFFLINE_MESSAGE);
    }
  }, [isOnline]);

  if (isOnline) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(150).reduceMotion(ReduceMotion.System)}
    >
      <View className="items-center border-b border-border bg-muted px-4 py-1.5">
        <AppText
          variant="caption"
          accessibilityLiveRegion="polite"
          className="text-muted-foreground"
        >
          {OFFLINE_MESSAGE}
        </AppText>
      </View>
    </Animated.View>
  );
}
