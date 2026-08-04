import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Input } from '@/components/base/ui/input';
import { spacing } from '@/constants';
import { useAppTheme } from '@/theme';
import { Icon } from './Icon';

type SearchbarProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChangeText' | 'placeholder' | 'style'
> & {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Search field with a leading magnifier and a trailing clear/loading affordance, replacing react-native-paper's Searchbar. */
export function Searchbar({
  value,
  onChangeText,
  placeholder,
  loading = false,
  style,
  // Forwarded to the Input, the element that takes focus, so callers can supply
  // accessibilityHint and friends instead of having them silently dropped.
  ...rest
}: SearchbarProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.leadingIcon}>
        <Icon name="magnify" size="md" color={theme.colors.onSurfaceVariant} />
      </View>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder ?? 'Search'}
        {...rest}
        // Inset via className, not `style`: react-native-web compiles
        // StyleSheet.create to atomic CSS classes, so a `style` padding lands in
        // the same cascade as the primitive's own `px-3` and loses on source
        // order. Through `cn` it merges instead, and the text clears the icons.
        className="pl-10 pr-10"
      />
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.onSurfaceVariant}
          style={styles.trailing}
        />
      ) : value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          // 20px glyph + 12px hitSlop/side = 44px tap target (a11y floor).
          hitSlop={12}
          style={styles.trailing}
        >
          <Icon name="close" size="md" color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  leadingIcon: {
    position: 'absolute',
    left: spacing.sm + 4,
    zIndex: 1,
  },
  trailing: {
    position: 'absolute',
    right: spacing.sm + 4,
  },
});
