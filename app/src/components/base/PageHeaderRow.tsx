import type { ReactNode } from 'react';
import { View } from 'react-native';
import { heading } from '@/utils/a11y';
import { AppText } from './AppText';
import { HeaderBackButton } from './HeaderBackButton';

/**
 * In-page title + back row for the >=lg web chrome, where the stack header is
 * hidden behind TopNav (DESIGN.md: never both). `title` is a string or the same
 * custom title node a screen hands to the stack header below lg.
 */
export function PageHeaderRow({ title, onBack }: { title: ReactNode; onBack: () => void }) {
  return (
    <View testID="page-header-row" className="flex-row items-center gap-2 px-4 py-2">
      <HeaderBackButton canGoBack onPress={onBack} />
      {typeof title === 'string' ? (
        <AppText
          variant="title"
          {...heading(1)}
          numberOfLines={1}
          className="font-semibold"
          style={{ flexShrink: 1 }}
        >
          {title}
        </AppText>
      ) : (
        title
      )}
    </View>
  );
}
