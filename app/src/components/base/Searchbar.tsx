import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Input } from '@/components/base/ui/input';
import { useAppTheme } from '@/theme/appThemeContext';
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

/** Search field with a leading magnifier and a trailing clear/loading affordance. */
export function Searchbar({
  value,
  onChangeText,
  placeholder,
  loading = false,
  style,
  ref,
  // Forwarded to the Input, the element that takes focus.
  ...rest
}: SearchbarProps) {
  const theme = useAppTheme();
  const handleClear = useCallback(() => onChangeText(''), [onChangeText]);

  return (
    <View className="justify-center" style={style}>
      <View className="absolute left-3" style={styles.leadingIcon}>
        <Icon name="search" size="md" color={theme.colors.mutedForeground} />
      </View>
      <Input
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder ?? 'Search'}
        {...rest}
        // Inset via className, not `style`: on web a `style` padding loses to
        // the primitive's own `px-3` on source order; `cn` merges instead.
        className="pl-10 pr-11"
      />
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.mutedForeground}
          className="absolute right-3"
        />
      ) : value ? (
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          className="absolute right-0 min-w-11 min-h-11 items-center justify-center"
        >
          <Icon name="x" size="md" color={theme.colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leadingIcon: {
    // zIndex 1 has no Tailwind step (the scale jumps 0 -> 10).
    zIndex: 1,
  },
});
