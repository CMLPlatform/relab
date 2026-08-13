import { useCallback } from 'react';
import { Pressable, type PressableStateCallbackType, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import type { CPVCategory } from '@/types/CPVCategory';

interface Props {
  CPV: CPVCategory;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  const { colors, tokens } = useAppTheme();
  const error = CPV.name === 'undefined';

  const bgColor = error ? colors.errorContainer : tokens.surface.accent;
  const textColor = error ? colors.onErrorContainer : colors.primary;

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
      className="rounded-lg overflow-hidden h-[100px] justify-between"
      style={{ backgroundColor: bgColor }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={CPV.description}
        style={pressableStyle}
      >
        <Text
          className="p-3"
          style={[styles.text, { color: textColor }]}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {CPV.description}
        </Text>
      </Pressable>
      {actionElement ?? (
        <Text className="p-3 text-right opacity-70" style={{ color: textColor }}>
          {CPV.name}
        </Text>
      )}
      <View style={styles.shapes}>
        <Icon name="shapes" size={150} color={textColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  // fontSize-only (no matching lineHeight) — stays style-driven.
  text: {
    fontSize: 15,
    fontWeight: '500',
  },
  // Decorative rotated glyph — no precedent for the react-native-css
  // transform/rotate utilities elsewhere in the app; keep it inline rather
  // than risk a silently-dropped style.
  shapes: {
    position: 'absolute',
    right: 10,
    top: -30,
    transform: [{ rotate: '-15deg' }],
    opacity: 0.1,
    zIndex: -1,
  },
});
