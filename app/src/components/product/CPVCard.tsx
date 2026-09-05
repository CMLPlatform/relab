import { useCallback } from 'react';
import { Pressable, type PressableStateCallbackType, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { getStatusTone, useAppTheme } from '@/theme';
import type { CPVCategory } from '@/types/CPVCategory';

interface Props {
  CPV: CPVCategory;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  const { colors, tokens } = useAppTheme();
  const error = CPV.name === 'undefined';

  // Tinted danger fill, not a full errorContainer recolor (MD3 *Container
  // roles are retired) — same pattern as Chip's error state.
  const bgColor = error ? getStatusTone(tokens.status.danger) : tokens.surface.accent;
  const textColor = error ? tokens.status.danger : colors.primary;

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      // No className on this Pressable: it would drop this function (see IconButton.tsx).
      styles.pressable,
      pressed && onPress && { opacity: 0.5 },
    ],
    [onPress],
  );

  return (
    <View
      className="rounded-lg overflow-hidden min-h-[100px] justify-between"
      style={{ backgroundColor: bgColor }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={CPV.description}
        style={pressableStyle}
      >
        <AppText
          variant="caption"
          className="p-3"
          style={{ color: textColor, fontWeight: '500' }}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {CPV.description}
        </AppText>
      </Pressable>
      {actionElement ?? (
        <AppText variant="caption" className="p-3 text-right" style={{ color: textColor }}>
          {CPV.name}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
});
