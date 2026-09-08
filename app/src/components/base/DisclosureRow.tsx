import { VARIANT_FOREGROUND_COLOR } from '@/components/base/appButtonVariants';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { AppButton } from './AppButton';
import { Icon } from './Icon';
import { Text } from './ui/text';

type DisclosureRowProps = {
  /** Carries the count, e.g. "Show 3 more components" — never a bare "Show". */
  label: string;
  expanded: boolean;
  onPress: () => void;
  className?: string;
};

/** The detail screens' disclosure row: ghost row, label, chevron right/down. */
export function DisclosureRow({ label, expanded, onPress, className }: DisclosureRowProps) {
  const { colors } = useAppTheme();
  return (
    <AppButton
      variant="ghost"
      onPress={onPress}
      accessibilityRole="button"
      // aria-*, not accessibilityState: react-native-web reads only the aria props,
      // while RN folds them back into accessibilityState for native.
      aria-expanded={expanded}
      className={cn('self-start px-2', className)}
    >
      <Text>{label}</Text>
      <Icon
        name={expanded ? 'chevron-down' : 'chevron-right'}
        size="sm"
        color={VARIANT_FOREGROUND_COLOR.ghost(colors)}
      />
    </AppButton>
  );
}
