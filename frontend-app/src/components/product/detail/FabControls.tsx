import type { ComponentProps } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { AnimatedFAB, Tooltip } from 'react-native-paper';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';

type ProductFabControlsProps = {
  entityRole: 'product' | 'component';
  editMode: boolean;
  ownedByMe: boolean;
  productId?: number;
  productName: string;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  isDirty: boolean;
  isNew: boolean;
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
  isSaving,
  isDirty,
  isNew,
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
        isSaving={isSaving}
        isDirty={isDirty}
        isNew={isNew}
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
  isSaving,
  isDirty,
  isNew,
  ownedByMe,
  editMode,
}: {
  entityRole: 'product' | 'component';
  icon: ComponentProps<typeof AnimatedFAB>['icon'];
  onPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  isDirty: boolean;
  isNew: boolean;
  ownedByMe: boolean;
  editMode: boolean;
}) {
  // Validation gates the FAB whenever pressing it would save: dirty edits, or
  // a new product (which has no "exit edit mode" state to fall back to).
  const wouldSave = editMode && (isDirty || isNew);
  const titleLabel = entityRole === 'component' ? 'Component' : 'Product';
  const fab = (
    <AnimatedFAB
      icon={icon}
      onPress={onPress}
      style={styles.rightFab}
      disabled={(wouldSave && !validationValid) || isSaving}
      extended={fabExtended}
      label={editMode ? `Save ${titleLabel}` : `Edit ${titleLabel}`}
      visible={ownedByMe}
    />
  );

  // On web, the tooltip surfaces why the disabled save-FAB is disabled. Fall back
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
  position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
  bottom: 0,
  margin: 19,
};

const styles = {
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
};
