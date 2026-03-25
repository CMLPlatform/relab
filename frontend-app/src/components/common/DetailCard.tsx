import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Card } from 'react-native-paper';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function DetailCard({ children, style, contentStyle }: Props) {
  return (
    <Card elevation={2} style={[styles.card, style]}>
      <Card.Content style={[styles.content, contentStyle]}>{children}</Card.Content>
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
