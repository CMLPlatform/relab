import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ReduceMotion } from 'react-native-reanimated';
import { AppText } from './AppText';

/** Persistent strip stating the offline contract: nothing is lost, sends resume on reconnect. */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
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
          Offline — your captures will send when you're back online
        </AppText>
      </View>
    </Animated.View>
  );
}
