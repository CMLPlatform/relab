import type { ComponentProps } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { AnimatedFAB, Tooltip } from 'react-native-paper';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';

type ProductFabControlsProps = {
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  isNew: boolean;
  editMode: boolean;
  isProductComponent: boolean;
  ownedByMe: boolean;
  productId?: number;
  productName: string;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  onPrimaryFabPress: () => void;
  onOpenStreamPicker: () => void;
  streamPickerVisible: boolean;
  onDismissStreamPicker: () => void;
  showGoLiveFab: boolean;
  primaryFabIcon: ComponentProps<typeof AnimatedFAB>['icon'];
};

export function ProductFabControls({
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  isNew,
  editMode,
  isProductComponent,
  ownedByMe,
  productId,
  productName,
  fabExtended,
  validationError,
  validationValid,
  isSaving,
  onPrimaryFabPress,
  onOpenStreamPicker,
  streamPickerVisible,
  onDismissStreamPicker,
  showGoLiveFab,
  primaryFabIcon,
}: ProductFabControlsProps) {
  if (showGoLiveFab && productId) {
    return (
      <>
        {rpiEnabled &&
        youtubeEnabled &&
        isGoogleLinked &&
        !isNew &&
        !editMode &&
        !isProductComponent &&
        ownedByMe ? (
          <AnimatedFAB
            icon="youtube"
            label="Go Live"
            extended={fabExtended}
            onPress={onOpenStreamPicker}
            style={styles.leftFab}
          />
        ) : null}
        <PrimaryProductFab
          icon={primaryFabIcon}
          onPress={onPrimaryFabPress}
          fabExtended={fabExtended}
          validationError={validationError}
          validationValid={validationValid}
          isSaving={isSaving}
          ownedByMe={ownedByMe}
          editMode={editMode}
        />
        <CameraStreamPicker
          productId={productId}
          productName={productName}
          visible={streamPickerVisible}
          onDismiss={onDismissStreamPicker}
        />
      </>
    );
  }

  return (
    <PrimaryProductFab
      icon={primaryFabIcon}
      onPress={onPrimaryFabPress}
      fabExtended={fabExtended}
      validationError={validationError}
      validationValid={validationValid}
      isSaving={isSaving}
      ownedByMe={ownedByMe}
      editMode={editMode}
    />
  );
}

function PrimaryProductFab({
  icon,
  onPress,
  fabExtended,
  validationError,
  validationValid,
  isSaving,
  ownedByMe,
  editMode,
}: {
  icon: ComponentProps<typeof AnimatedFAB>['icon'];
  onPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  ownedByMe: boolean;
  editMode: boolean;
}) {
  const fab = (
    <AnimatedFAB
      icon={icon}
      onPress={onPress}
      style={styles.rightFab}
      disabled={(editMode && !validationValid) || isSaving}
      extended={fabExtended}
      label={editMode ? 'Save Product' : 'Edit Product'}
      visible={ownedByMe}
    />
  );

  if (editMode && validationError) {
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
  leftFab: {
    ...baseFabStyle,
    left: 0,
  } satisfies ViewStyle,
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
};
