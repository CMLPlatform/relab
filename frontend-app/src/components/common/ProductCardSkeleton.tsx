import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Card, useTheme } from 'react-native-paper';

function SkeletonBox({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[{ opacity }, style]} />;
}

export default function ProductCardSkeleton() {
  const theme = useTheme();
  const bg = theme.colors.surfaceVariant;

  return (
    <Card elevation={2} style={{ marginHorizontal: 10, marginVertical: 5 }}>
      <View style={styles.row}>
        <SkeletonBox style={[styles.thumbnail, { backgroundColor: bg }]} />
        <View style={styles.content}>
          <SkeletonBox style={[styles.titleLine, { backgroundColor: bg }]} />
          <SkeletonBox style={[styles.subtitleLine, { backgroundColor: bg }]} />
          <SkeletonBox style={[styles.descLine, { backgroundColor: bg }]} />
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
    gap: 8,
  },
  titleLine: {
    height: 18,
    borderRadius: 4,
    width: '60%',
  },
  subtitleLine: {
    height: 13,
    borderRadius: 4,
    width: '40%',
  },
  descLine: {
    height: 13,
    borderRadius: 4,
    width: '85%',
  },
});
