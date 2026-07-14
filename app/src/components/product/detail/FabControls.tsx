import type { ComponentProps } from 'react';
import type { ViewStyle } from 'react-native';
import { AnimatedFAB, Tooltip } from 'react-native-paper';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';
import { getFloatingPosition } from '@/utils/platformLayout';

type ProductFabControlsProps = {
  entityRole: 'product' | 'component';
  editMode: boolean;
  ownedByMe: boolean;
  productId?: number;
  productName: string;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  errorCount?: number;
  onErrorSummaryPress?: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onPrimaryFabPress: () => void;
  streamPickerVisible: boolean;
  onDismissStreamPicker: () => void;
  primaryFabIcon: ComponentProps<typeof AnimatedFAB>['icon'];
};

export function ProductFabControls({
  entityRole,
  editMode,
  ownedByMe,
  productId,
  productName,
  fabExtended,
  validationError,
  validationValid,
  errorCount,
  onErrorSummaryPress,
  isSaving,
  isDirty,
  onPrimaryFabPress,
  streamPickerVisible,
  onDismissStreamPicker,
  primaryFabIcon,
}: ProductFabControlsProps) {
  return (
    <>
      <PrimaryProductFab
        entityRole={entityRole}
        icon={primaryFabIcon}
        onPress={onPrimaryFabPress}
        fabExtended={fabExtended}
        validationError={validationError}
        validationValid={validationValid}
        errorCount={errorCount}
        onErrorSummaryPress={onErrorSummaryPress}
        isSaving={isSaving}
        isDirty={isDirty}
        ownedByMe={ownedByMe}
        editMode={editMode}
      />
      {productId ? (
        <CameraStreamPicker
          productId={productId}
          productName={productName}
          visible={streamPickerVisible}
          onDismiss={onDismissStreamPicker}
        />
      ) : null}
    </>
  );
}

function PrimaryProductFab({
  entityRole,
  icon,
  onPress,
  fabExtended,
  validationError,
  validationValid,
  errorCount,
  onErrorSummaryPress,
  isSaving,
  isDirty,
  ownedByMe,
  editMode,
}: {
  entityRole: 'product' | 'component';
  icon: ComponentProps<typeof AnimatedFAB>['icon'];
  onPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  errorCount?: number;
  onErrorSummaryPress?: () => void;
  isSaving: boolean;
  isDirty: boolean;
  ownedByMe: boolean;
  editMode: boolean;
}) {
  // Validation gates the FAB whenever pressing it would save dirty edits.
  const wouldSave = editMode && isDirty;
  const titleLabel = entityRole === 'component' ? 'Component' : 'Product';
  // Invalid + errors to show: swap the FAB from "save" to "go to the first
  // problem" instead of blocking the press behind a disabled button.
  const needsAttention = wouldSave && !validationValid && (errorCount ?? 0) > 0;
  const label = needsAttention
    ? `${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`
    : editMode
      ? `Save ${titleLabel}`
      : `Edit ${titleLabel}`;
  // Invalid with no known error count (errorCount undefined/0) has no error
  // summary to route to, so — unlike the needsAttention case — the only safe
  // move is to block the press outright instead of saving invalid data.
  const blockedByValidation = wouldSave && !validationValid && !needsAttention;
  const fab = (
    <AnimatedFAB
      icon={icon}
      onPress={needsAttention ? (onErrorSummaryPress ?? onPress) : onPress}
      style={styles.rightFab}
      disabled={isSaving || blockedByValidation}
      extended={fabExtended}
      label={label}
      visible={ownedByMe}
    />
  );

  // On web, the tooltip surfaces why the save-FAB is disabled/blocked. Fall back
  // to a generic hint when the form is invalid but no specific error has been
  // computed yet (e.g. brand-new draft before the user has touched any field).
  if (wouldSave && !validationValid) {
    const tooltipTitle = validationError ?? 'Fill in the required fields to save';
    return (
      <Tooltip title={tooltipTitle} enterTouchDelay={0} leaveTouchDelay={1500}>
        {fab}
      </Tooltip>
    );
  }

  return fab;
}

const baseFabStyle: ViewStyle = {
  position: getFloatingPosition(),
  bottom: 0,
  margin: 19,
};

const styles = {
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
};
