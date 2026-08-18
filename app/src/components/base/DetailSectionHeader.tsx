import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { InfoTooltip } from './InfoTooltip';

interface Props {
  title: string;
  tooltipTitle?: string;
  rightElement?: Exclude<ReactNode, Promise<unknown>>;
}

/**
 * A sub-header inside a Section card. Section itself is the card title
 * (`heading`, 19/24), so this sits one step below it: body size, semibold.
 */
export default function DetailSectionHeader({ title, tooltipTitle, rightElement }: Props) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="flex-1 flex-row items-center gap-1.5">
        {/* The tooltip renders a View, so it sits beside the AppText, not inside it. */}
        <AppText variant="body" className="font-semibold">
          {title}
        </AppText>
        {tooltipTitle ? <InfoTooltip title={tooltipTitle} /> : null}
      </View>
      {rightElement ? <View className="ml-2">{rightElement}</View> : null}
    </View>
  );
}
