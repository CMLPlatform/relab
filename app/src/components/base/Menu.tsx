import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { radius, spacing } from '@/constants';
import { useAppTheme } from '@/theme';

type MenuProps = {
  visible: boolean;
  onDismiss: () => void;
  anchor: ReactNode;
  children: ReactNode;
};

type Position = { top: number; left: number };

/**
 * Anchored dropdown menu, replacing react-native-paper's Menu. Renders in an
 * RN-core Modal (no PortalHost involved) with a full-screen dismiss backdrop;
 * position is measured from the anchor once the menu opens.
 *
 * NOTE: position is captured on open only, not tracked live — a menu left
 * open while its anchor scrolls out from under it (e.g. a chip in a
 * horizontally-scrolling filter bar) won't follow it. Matches how most
 * non-portal dropdown implementations behave; revisit if it's ever left open
 * during a scroll in practice.
 */
export function Menu({ visible, onDismiss, anchor, children }: MenuProps) {
  const theme = useAppTheme();
  const anchorRef = useRef<View>(null);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

  useEffect(() => {
    if (!visible) return;
    anchorRef.current?.measureInWindow((x, y, _width, height) => {
      setPosition({ top: y + height + spacing.xs, left: x });
    });
  }, [visible]);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {anchor}
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Dismiss menu"
        >
          {/* Swallow presses so tapping an item doesn't fall through to the backdrop. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.content, position, { backgroundColor: theme.colors.elevation.level2 }]}
          >
            {children}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  title,
  trailingIcon,
  onPress,
}: {
  title: string;
  trailingIcon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [
        styles.item,
        pressed && { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <AppText testID="menu-item-title" style={styles.itemLabel}>
        {title}
      </AppText>
      {trailingIcon ? (
        <MaterialCommunityIcons name={trailingIcon} size={18} color={theme.colors.onSurface} />
      ) : null}
    </Pressable>
  );
}

Menu.Item = MenuItem;

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    minWidth: 180,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    elevation: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  itemLabel: {
    flexShrink: 1,
  },
});
