import { StyleSheet, View } from 'react-native';
import { Card } from 'react-native-paper';
import { Skeleton } from '@/components/base/Skeleton';
import { radius, spacing } from '@/constants/layout';
import { useAppTheme } from '@/theme';

export default function ProductCardSkeleton() {
  const theme = useAppTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <Card elevation={2} style={{ marginHorizontal: 10, marginVertical: 5 }}>
      <View style={styles.row}>
        <Skeleton style={[styles.thumbnail, { backgroundColor: bg }]} />
        <View style={styles.content}>
          <Skeleton style={[styles.titleLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.subtitleLine, { backgroundColor: bg }]} />
          <Skeleton style={[styles.descLine, { backgroundColor: bg }]} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
  },
  content: {
    flex: 1,
    gap: spacing.sm,
  },
  titleLine: {
    height: 18,
    borderRadius: radius.sm,
    width: '60%',
  },
  subtitleLine: {
    height: 13,
    borderRadius: radius.sm,
    width: '40%',
  },
  descLine: {
    height: 13,
    borderRadius: radius.sm,
    width: '85%',
  },
});
