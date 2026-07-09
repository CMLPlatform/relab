import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, View } from 'react-native';

import { InfoTooltip } from './InfoTooltip';
import { Text } from './Text';

interface Props {
  title: string;
  tooltipTitle?: string;
  rightElement?: Exclude<ReactNode, Promise<unknown>>;
  style?: StyleProp<TextStyle>;
}

export default function DetailSectionHeader({ title, tooltipTitle, rightElement, style }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {/* The tooltip renders a View, so it sits beside the Text, not inside it. */}
        <Text style={[styles.title, style]}>{title}</Text>
        {tooltipTitle ? <InfoTooltip title={tooltipTitle} /> : null}
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
