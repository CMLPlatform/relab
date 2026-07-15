import { MaterialCommunityIcons } from '@expo/vector-icons';
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

type SearchbarProps = {
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
}: SearchbarProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, style]}>
      <MaterialCommunityIcons
        name="magnify"
        size={20}
        color={theme.colors.onSurfaceVariant}
        style={styles.leadingIcon}
      />
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder ?? 'Search'}
        style={styles.input}
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
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurfaceVariant} />
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
  input: {
    paddingLeft: 40,
    paddingRight: 40,
  },
});
