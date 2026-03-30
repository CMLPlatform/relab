import { Icon } from 'react-native-paper';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { CPVCategory } from '@/types/CPVCategory';
import { useAppTheme } from '@/hooks/useAppTheme';

interface Props {
  CPV: CPVCategory;
  onPress?: () => void;
  actionElement?: React.ReactNode;
}

export default function CPVCard({ CPV, onPress, actionElement }: Props) {
  const { colors } = useAppTheme();
  const error = CPV.name === 'undefined';

  const bgColor = error ? colors.errorContainer : colors.primaryContainer;
  const textColor = error ? colors.onErrorContainer : colors.onPrimaryContainer;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={CPV.description}
      style={({ pressed }) => [styles.container, { backgroundColor: bgColor }, pressed && onPress && { opacity: 0.5 }]}
    >
      <Text style={[styles.text, { color: textColor }]} numberOfLines={3} ellipsizeMode="tail">
        {CPV.description}
      </Text>
      {actionElement || <Text style={[styles.subText, { color: textColor }]}>{CPV.name}</Text>}
      <View style={styles.shapes}>
        <Icon source="shape" size={150} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 5,
    overflow: 'hidden',
    height: 100,
    justifyContent: 'space-between',
  },
  text: {
    padding: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  subText: {
    padding: 12,
    opacity: 0.7,
    textAlign: 'right',
  },
  shapes: {
    position: 'absolute',
    right: 10,
    top: -30,
    transform: [{ rotate: '-15deg' }],
    opacity: 0.1,
    zIndex: -1,
  },
});
