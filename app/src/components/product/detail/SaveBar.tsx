import { View, type ViewStyle } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { getFloatingPosition } from '@/utils/platformLayout';

type SaveBarProps = {
  entityRole: 'product' | 'component';
  editMode: boolean;
  isDirty: boolean;
  isSaving: boolean;
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
  entityRole,
  editMode,
  isDirty,
  isSaving,
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
  // Mirrors PrimaryProductFab: in the needsAttention state the entire press
  // routes to the error summary instead of saving invalid data.
  const onPrimaryButtonPress = needsAttention
    ? (onErrorSummaryPress ?? onPrimaryPress)
    : onPrimaryPress;
  return (
    <View
      style={dockStyle}
      className="flex-row items-center gap-3 rounded-lg border border-border bg-background px-4 py-2"
    >
      {needsAttention ? (
        <AppButton variant="ghost" onPress={onErrorSummaryPress ?? onPrimaryPress}>
          {`${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`}
        </AppButton>
      ) : null}
      {blockedByValidation && validationError ? (
        <AppText variant="label" className="text-destructive">
          {validationError}
        </AppText>
      ) : null}
      <AppButton
        variant="primary"
        onPress={onPrimaryButtonPress}
        loading={isSaving}
        disabled={isSaving || blockedByValidation}
      >
        {editMode ? `Save ${titleLabel}` : `Edit ${titleLabel}`}
      </AppButton>
    </View>
  );
}

// 24px matches the visual right-6/bottom-6 offset; position comes from
// getFloatingPosition() (like Fab.tsx's baseFabStyle) so the bar docks to the
// viewport ('fixed' on web) instead of the nearest positioned ancestor.
const dockStyle: ViewStyle = {
  position: getFloatingPosition(),
  right: 24,
  bottom: 24,
};
