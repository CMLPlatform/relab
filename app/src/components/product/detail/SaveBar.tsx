import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';

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

/** Docked action bar for >=md web: Edit / Save plus an inline error summary. */
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
  return (
    <View className="absolute right-6 bottom-6 flex-row items-center gap-3 rounded-lg border border-border bg-background px-4 py-2">
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
        onPress={onPrimaryPress}
        loading={isSaving}
        disabled={isSaving || blockedByValidation}
      >
        {editMode ? `Save ${titleLabel}` : `Edit ${titleLabel}`}
      </AppButton>
    </View>
  );
}
