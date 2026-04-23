import type { ComponentProps } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { AnimatedFAB, Tooltip } from 'react-native-paper';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';

type ProductFabControlsProps = {
  editMode: boolean;
  ownedByMe: boolean;
  productId?: number;
  productName: string;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  isDirty: boolean;
  onPrimaryFabPress: () => void;
  streamPickerVisible: boolean;
  onDismissStreamPicker: () => void;
  primaryFabIcon: ComponentProps<typeof AnimatedFAB>['icon'];
};

export function ProductFabControls({
  editMode,
  ownedByMe,
  productId,
  productName,
  fabExtended,
  validationError,
  validationValid,
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
        icon={primaryFabIcon}
        onPress={onPrimaryFabPress}
        fabExtended={fabExtended}
        validationError={validationError}
        validationValid={validationValid}
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
  icon,
  onPress,
  fabExtended,
  validationError,
  validationValid,
  isSaving,
  isDirty,
  ownedByMe,
  editMode,
}: {
  icon: ComponentProps<typeof AnimatedFAB>['icon'];
  onPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  isDirty: boolean;
  ownedByMe: boolean;
  editMode: boolean;
}) {
  // Validation only matters when pressing the FAB would actually save
  // (i.e. dirty). Otherwise the FAB just exits edit mode / discards a draft.
  const wouldSave = editMode && isDirty;
  const fab = (
    <AnimatedFAB
      icon={icon}
      onPress={onPress}
      style={styles.rightFab}
      disabled={(wouldSave && !validationValid) || isSaving}
      extended={fabExtended}
      label={editMode ? 'Save Product' : 'Edit Product'}
      visible={ownedByMe}
    />
  );

  if (wouldSave && validationError) {
    return (
      <Tooltip title={validationError} enterTouchDelay={0} leaveTouchDelay={1500}>
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
