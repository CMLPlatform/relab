import type { ComponentProps, RefObject } from 'react';
import { Platform, type View, type ViewStyle } from 'react-native';
import { Fab } from '@/components/base/Fab';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';
import { spacing } from '@/constants';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getFloatingPosition } from '@/utils/platformLayout';
import { SaveBar } from './SaveBar';

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
  /** Mutation is paused offline (TanStack's `isPaused`): swaps the label, drops the spinner. */
  isPaused: boolean;
  isDirty: boolean;
  onPrimaryFabPress: () => void;
  streamPickerVisible: boolean;
  onDismissStreamPicker: () => void;
  primaryFabIcon: ComponentProps<typeof Fab>['icon'];
  streamTriggerRef?: RefObject<View | null>;
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
  isPaused,
  isDirty,
  onPrimaryFabPress,
  streamPickerVisible,
  onDismissStreamPicker,
  primaryFabIcon,
  streamTriggerRef,
}: ProductFabControlsProps) {
  const { isMd } = useBreakpoint();
  const bottomNavVisible = useBottomNavVisible();
  // Web-only: position:fixed sits against the viewport and overlaps the tab
  // bar; on native the scene is already shrunk by the bar.
  const bottomOffset = Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0;
  return (
    <>
      {isMd || editMode ? (
        <SaveBar
          layout={isMd ? 'floating' : 'flow'}
          bottomOffset={bottomOffset}
          entityRole={entityRole}
          editMode={editMode}
          isDirty={isDirty}
          isSaving={isSaving}
          isPaused={isPaused}
          validationValid={validationValid}
          validationError={validationError}
          errorCount={errorCount}
          onErrorSummaryPress={onErrorSummaryPress}
          onPrimaryPress={onPrimaryFabPress}
          ownedByMe={ownedByMe}
        />
      ) : (
        <PrimaryProductFab
          bottomOffset={bottomOffset}
          entityRole={entityRole}
          icon={primaryFabIcon}
          onPrimaryPress={onPrimaryFabPress}
          fabExtended={fabExtended}
          isSaving={isSaving}
          isPaused={isPaused}
          ownedByMe={ownedByMe}
        />
      )}
      {productId ? (
        <CameraStreamPicker
          productId={productId}
          productName={productName}
          visible={streamPickerVisible}
          onDismiss={onDismissStreamPicker}
          triggerRef={streamTriggerRef}
        />
      ) : null}
    </>
  );
}

function PrimaryProductFab({
  bottomOffset,
  entityRole,
  icon,
  onPrimaryPress,
  fabExtended,
  isSaving,
  isPaused,
  ownedByMe,
}: {
  bottomOffset: number;
  entityRole: 'product' | 'component';
  icon: ComponentProps<typeof Fab>['icon'];
  onPrimaryPress: () => void;
  fabExtended: boolean;
  isSaving: boolean;
  isPaused: boolean;
  ownedByMe: boolean;
}) {
  // Edit mode always routes to SaveBar, so this FAB only ever opens the editor:
  // it carries no save, validation, or error-summary state of its own.
  const titleLabel = entityRole === 'component' ? 'Component' : 'Product';
  // Offline: the mutation is paused, not loading; no spinner.
  const label = isSaving && isPaused ? QUEUED_OFFLINE_LABEL : `Edit ${titleLabel}`;

  return (
    <Fab
      testID="product-primary-fab"
      icon={icon}
      label={label}
      accessibilityLabel={label}
      onPress={onPrimaryPress}
      style={[styles.rightFab, { bottom: bottomOffset }]}
      disabled={isSaving}
      extended={fabExtended}
      visible={ownedByMe}
    />
  );
}

const baseFabStyle: ViewStyle = {
  position: getFloatingPosition(),
  bottom: 0,
  // Matches the list screens' Fab bottom offset (spacing.md); ActiveStreamBanner clears it.
  margin: spacing.md,
};

const styles = {
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
};
