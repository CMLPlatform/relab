import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

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
      {/* Decorative — hidden from the accessibility tree, matching StaticBackground's aria-hidden treatment. */}
      <View aria-hidden>
        <Icon name="image" size={iconSize} color={theme.colors.outline} />
      </View>
      {label ? (
        <AppText
          variant="label"
          numberOfLines={2}
          style={{
            marginTop: 4,
            // NOTE: scaled to the placeholder's own measured height so the
            // label fits arbitrarily small/large slots — a fixed ramp step
            // would overflow tiny thumbnails or look lost in large ones.
            fontSize: Math.max(11, Math.min(14, height * 0.06)),
            color: theme.colors.outline,
            textAlign: 'center',
            paddingHorizontal: 8,
          }}
        >
          {label}
        </AppText>
      ) : null}
    </View>
  );
}
