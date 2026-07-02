import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { Card } from 'react-native-paper';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function DetailCard({ children, style }: Props) {
  return (
    <Card elevation={2} style={[styles.card, style]}>
      <Card.Content style={styles.content}>{children}</Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
  },
});
