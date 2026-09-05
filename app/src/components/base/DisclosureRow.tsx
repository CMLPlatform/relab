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

/**
 * The detail screens' one disclosure idiom: a left-aligned ghost row whose
 * label says what opens and how much of it, with a chevron that points right
 * when collapsed and down when expanded. Section's empty-state "Add …" row uses
 * it too — that row also opens hidden content, so it is the same affordance.
 */
export function DisclosureRow({ label, expanded, onPress, className }: DisclosureRowProps) {
  const { colors } = useAppTheme();
  return (
    <AppButton
      variant="ghost"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
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
