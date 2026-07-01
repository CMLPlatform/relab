import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { getStatusTone } from '@/theme';

type StatusBadgeProps = {
  label: string;
  color: string;
};

export function StatusBadge({ label, color }: StatusBadgeProps) {
  return (
    <View style={[styles.container, { backgroundColor: getStatusTone(color) }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
