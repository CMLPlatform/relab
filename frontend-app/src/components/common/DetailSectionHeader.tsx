import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, View } from 'react-native';

import { InfoTooltip, Text } from '@/components/base';

interface Props {
  title: string;
  tooltipTitle?: string;
  rightElement?: ReactNode;
  style?: StyleProp<TextStyle>;
}

export default function DetailSectionHeader({ title, tooltipTitle, rightElement, style }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={[styles.title, style]}>
          {title}
          {tooltipTitle ? <InfoTooltip title={tooltipTitle} /> : null}
        </Text>
      </View>
      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  right: {
    marginLeft: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
