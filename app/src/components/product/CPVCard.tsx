import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { WEB_FOCUS_RING } from '@/constants';
import type { CPVCategory } from '@/types/CPVCategory';

interface Props {
  CPV: Pick<CPVCategory, 'name' | 'description'>;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

/** Category card: name as the heading, description as a caption under it. Plain card surface. */
export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  return (
    <View
      // The fixed floor keeps pickable cards even in a selection grid; a read-only
      // card on a record hugs its text instead of trailing an empty band.
      className={`rounded-lg border border-border bg-card overflow-hidden justify-between ${onPress ? 'min-h-[100px]' : ''}`}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${CPV.name}, ${CPV.description}` : undefined}
        className={`flex-1 ${onPress ? 'active:opacity-50' : ''} ${WEB_FOCUS_RING}`}
      >
        <View className="p-3 gap-0.5">
          <AppText
            variant="heading"
            className="font-semibold"
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {CPV.name}
          </AppText>
          <AppText
            variant="caption"
            className="text-muted-foreground"
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {CPV.description}
          </AppText>
        </View>
      </Pressable>
      {actionElement}
    </View>
  );
}

/** Shown when the category name could not be loaded: the type ID and a retry link. */
export function CpvTypeLoadError({ typeID, retry }: { typeID: number; retry?: () => void }) {
  const message = `Category ${typeID}. Couldn't load its name.`;
  // VoiceOver ignores accessibilityLiveRegion; announce explicitly.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <View testID="cpv-load-error-status" role="status" accessibilityLiveRegion="polite">
        <AppText variant="caption" className="text-muted-foreground">
          {message}
        </AppText>
      </View>
      {retry ? (
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading category name"
          // min-h-11: the 44px tap floor; the caption alone is ~16px tall.
          className={`min-h-11 justify-center ${WEB_FOCUS_RING}`}
        >
          <AppText variant="caption" className="underline">
            Retry
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
