import type { ReactNode } from 'react';
import { type StyleProp, type TextStyle, View } from 'react-native';
import { AppText } from './AppText';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  title: string;
  tooltipTitle?: string;
  rightElement?: Exclude<ReactNode, Promise<unknown>>;
  style?: StyleProp<TextStyle>;
}

export default function DetailSectionHeader({ title, tooltipTitle, rightElement, style }: Props) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-1 flex-row items-center gap-1.5">
        {/* The tooltip renders a View, so it sits beside the AppText, not inside it. */}
        <AppText variant="plain" className="text-2xl font-bold" style={style}>
          {title}
        </AppText>
        {tooltipTitle ? <InfoTooltip title={tooltipTitle} /> : null}
      </View>
      {rightElement ? <View className="ml-2">{rightElement}</View> : null}
    </View>
  );
}
