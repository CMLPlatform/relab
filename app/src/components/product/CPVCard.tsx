import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { WEB_FOCUS_RING } from '@/constants';
import { getStatusTone, useAppTheme } from '@/theme';
import type { CPVCategory } from '@/types/CPVCategory';

interface Props {
  CPV: CPVCategory;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

/** Category card: name as the heading, description as a caption under it. Plain card surface. */
export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  const { tokens } = useAppTheme();
  const error = CPV.name === 'undefined';

  return (
    <View
      className="rounded-lg border border-border bg-card overflow-hidden min-h-[100px] justify-between"
      // Tinted danger fill, same as Chip's error state.
      style={error ? { backgroundColor: getStatusTone(tokens.status.danger) } : undefined}
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
            style={error ? { color: tokens.status.danger } : undefined}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {CPV.name}
          </AppText>
          <AppText
            variant="caption"
            className="text-muted-foreground"
            style={error ? { color: tokens.status.danger } : undefined}
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
