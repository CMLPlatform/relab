import { Pressable, View } from 'react-native';
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
export function CpvTypeLoadError({ typeID, retry }: { typeID: number; retry: () => void }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <AppText variant="caption" className="text-muted-foreground">
        {`Category ${typeID}`}
      </AppText>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading category name"
        className={WEB_FOCUS_RING}
      >
        <AppText variant="caption" className="underline">
          Retry
        </AppText>
      </Pressable>
    </View>
  );
}
