import { View } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';
import { Text } from '@/components/base';

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
  const theme = useTheme();
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
      <Icon source="image-outline" size={iconSize} color={theme.colors.outline} />
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
