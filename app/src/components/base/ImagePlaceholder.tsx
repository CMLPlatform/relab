import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  width: number;
  height: number;
  label?: string;
  borderRadius?: number;
  testID?: string;
}

export default function ImagePlaceholder({
  width,
  height,
  label,
  borderRadius = 8,
  testID,
}: Props) {
  const theme = useAppTheme();
  const iconSize = Math.min(width, height) * 0.3;

  return (
    <View
      testID={testID}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: theme.colors.surfaceVariant,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons
        name="image-outline"
        size={iconSize}
        color={theme.colors.outline}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // biome-ignore lint/suspicious/noExplicitAny: @expo/vector-icons omits aria-* from its prop types but forwards them to the DOM on web — decorative icon, same treatment as _layout.tsx's PAPER_SETTINGS.icon.
        {...({ 'aria-hidden': true } as any)}
      />
      {label ? (
        <Text
          numberOfLines={2}
          style={{
            marginTop: 4,
            fontSize: Math.max(11, Math.min(14, height * 0.06)),
            color: theme.colors.outline,
            textAlign: 'center',
            paddingHorizontal: 8,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
