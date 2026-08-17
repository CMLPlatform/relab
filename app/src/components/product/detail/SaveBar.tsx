import { View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { getFloatingPosition } from '@/utils/platformLayout';

type SaveBarProps = {
  /** Extra bottom inset so the dock clears BottomNav (see FabControls). */
  bottomOffset: number;
  entityRole: 'product' | 'component';
  editMode: boolean;
  isDirty: boolean;
  isSaving: boolean;
  /** Mutation is paused offline (TanStack's `isPaused`) — swaps the label, drops the spinner. */
  isPaused: boolean;
  validationValid: boolean;
  validationError?: string;
  errorCount?: number;
  onErrorSummaryPress?: () => void;
  onPrimaryPress: () => void;
  ownedByMe: boolean;
};

/**
 * Docked action bar for >=md web: Edit / Save plus an inline error summary.
 *
 * ActiveStreamBanner reserves right-side dock space for this bar via its own
 * route-pattern + isMd check (SAVE_BAR_DOCK_ROUTE) rather than reading this
 * component's state — if the route pattern here or the `ownedByMe` render
 * condition below changes, update ActiveStreamBanner.tsx too.
 */
export function SaveBar({
  bottomOffset,
  entityRole,
  editMode,
  isDirty,
  isSaving,
  isPaused,
  validationValid,
  validationError,
  errorCount,
  onErrorSummaryPress,
  onPrimaryPress,
  ownedByMe,
}: SaveBarProps) {
  if (!ownedByMe) return null;
  const titleLabel = entityRole === 'component' ? 'Component' : 'Product';
  // Mirrors PrimaryProductFab: validation only gates a press that would
  // actually save dirty edits, not a plain view->edit toggle.
  const wouldSave = editMode && isDirty;
  const needsAttention = wouldSave && !validationValid && (errorCount ?? 0) > 0;
  const blockedByValidation = wouldSave && !validationValid && !needsAttention;
  // Offline: the mutation is paused, not "loading" — no spinner to show
  // until connectivity returns.
  const isQueued = isSaving && isPaused;
  // Mirrors PrimaryProductFab: in the needsAttention state the entire press
  // routes to the error summary instead of saving invalid data.
  const onPrimaryButtonPress = needsAttention
    ? (onErrorSummaryPress ?? onPrimaryPress)
    : onPrimaryPress;
  return (
    <View
      testID="save-bar-dock"
      style={[dockStyle, { bottom: DOCK_BOTTOM + bottomOffset }]}
      className="flex-row items-center gap-3 rounded-lg border border-border bg-background px-4 py-2"
    >
      {/* NOTE: hand-rolled English plural. Swap this and FabControls' copy for
          Intl.PluralRules('en') behind a shared helper when the app gains a
          second locale — there is nothing to share until then. */}
      {needsAttention ? (
        <Animated.View entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}>
          <AppButton variant="ghost" onPress={onErrorSummaryPress ?? onPrimaryPress}>
            {`${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`}
          </AppButton>
        </Animated.View>
      ) : null}
      {blockedByValidation && validationError ? (
        <Animated.View entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}>
          <AppText variant="label" className="text-destructive">
            {validationError}
          </AppText>
        </Animated.View>
      ) : null}
      <AppButton
        variant="primary"
        onPress={onPrimaryButtonPress}
        loading={isSaving && !isPaused}
        disabled={isSaving || blockedByValidation}
      >
        {isQueued ? QUEUED_OFFLINE_LABEL : editMode ? `Save ${titleLabel}` : `Edit ${titleLabel}`}
      </AppButton>
    </View>
  );
}

// 24px matches the visual right-6/bottom-6 offset; position comes from
// getFloatingPosition() (like Fab.tsx's baseFabStyle) so the bar docks to the
// viewport ('fixed' on web) instead of the nearest positioned ancestor.
const DOCK_BOTTOM = 24;
const dockStyle: ViewStyle = {
  position: getFloatingPosition(),
  right: 24,
};
