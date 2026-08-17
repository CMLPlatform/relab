import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Platform, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Fab } from '@/components/base/Fab';
import { OverlaySurface } from '@/components/base/OverlaySurface';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';
import { spacing } from '@/constants';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAppTheme } from '@/theme';
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
  /** Mutation is paused offline (TanStack's `isPaused`) — see SaveBar/PrimaryProductFab. */
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
  // Web-only: these controls dock with position:fixed on web
  // (getFloatingPosition), so they sit against the viewport and overlap the tab
  // bar rendered at the bottom of the scene. On native they dock absolutely
  // inside that scene, which the bar has already shrunk — no bump. Detail
  // screens live inside a tab now, so the bar is over them too.
  const bottomOffset = Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0;
  return (
    <>
      {isMd ? (
        <SaveBar
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
          validationError={validationError}
          validationValid={validationValid}
          errorCount={errorCount}
          onErrorSummaryPress={onErrorSummaryPress}
          isSaving={isSaving}
          isPaused={isPaused}
          isDirty={isDirty}
          ownedByMe={ownedByMe}
          editMode={editMode}
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
  validationError,
  validationValid,
  errorCount,
  onErrorSummaryPress,
  isSaving,
  isPaused,
  isDirty,
  ownedByMe,
  editMode,
}: {
  bottomOffset: number;
  entityRole: 'product' | 'component';
  icon: ComponentProps<typeof Fab>['icon'];
  onPrimaryPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  errorCount?: number;
  onErrorSummaryPress?: () => void;
  isSaving: boolean;
  isPaused: boolean;
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
  // Offline: the mutation is paused, not "loading" — nothing to spin for
  // until connectivity returns (getPrimaryFabIcon swaps the FAB's icon too).
  const isQueued = isSaving && isPaused;
  const label = needsAttention
    ? `${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`
    : isQueued
      ? QUEUED_OFFLINE_LABEL
      : editMode
        ? `Save ${titleLabel}`
        : `Edit ${titleLabel}`;
  // Invalid with no known error count (errorCount undefined/0) has no error
  // summary to route to, so — unlike the needsAttention case — the only safe
  // move is to block the press outright instead of saving invalid data.
  const blockedByValidation = wouldSave && !validationValid && !needsAttention;
  const onFabPress = needsAttention ? (onErrorSummaryPress ?? onPrimaryPress) : onPrimaryPress;
  const disabled = isSaving || blockedByValidation;

  // On web, the tooltip surfaces why the save-FAB is disabled/blocked. Fall back
  // to a generic hint when the form is invalid but no specific error has been
  // computed yet (e.g. brand-new draft before the user has touched any field).
  if (wouldSave && !validationValid) {
    const tooltipTitle = validationError ?? 'Fill in the required fields to save';
    return (
      <SaveBlockedTooltip
        title={tooltipTitle}
        anchorStyle={[styles.rightFab, { bottom: bottomOffset }]}
      >
        <Fab
          icon={icon}
          label={label}
          accessibilityLabel={label}
          onPress={onFabPress}
          disabled={disabled}
          extended={fabExtended}
          visible={ownedByMe}
        />
      </SaveBlockedTooltip>
    );
  }

  return (
    <Fab
      icon={icon}
      label={label}
      accessibilityLabel={label}
      onPress={onFabPress}
      style={[styles.rightFab, { bottom: bottomOffset }]}
      disabled={disabled}
      extended={fabExtended}
      visible={ownedByMe}
    />
  );
}

/**
 * Wraps the FAB so hovering (web) or pressing-in (touch) surfaces why the save
 * action is blocked. Press-and-hold surfaces a tooltip (enterTouchDelay=0,
 * leaveTouchDelay=1500) positioned above the FAB, without a portal.
 */
function SaveBlockedTooltip({
  title,
  anchorStyle,
  children,
}: {
  title: string;
  anchorStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(hide, 1500);
    return () => clearTimeout(timer);
  }, [visible, hide]);

  return (
    <View style={anchorStyle}>
      <Pressable
        testID="fab-tooltip-trigger"
        onPressIn={show}
        onHoverIn={Platform.OS === 'web' ? show : undefined}
        onHoverOut={Platform.OS === 'web' ? hide : undefined}
      >
        {children}
      </Pressable>
      {visible ? (
        // The absolute anchor styles live on the Animated.View: an absolute
        // child resolves against its direct parent in RN, and an unpositioned
        // wrapper here is a zero-height box that would drop the bubble onto
        // the FAB instead of above it. pointerEvents="none" keeps the bubble
        // from eating FAB taps during its 1.5s hold.
        <Animated.View
          entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
          style={styles.tooltipAnchor}
          pointerEvents="none"
        >
          <OverlaySurface
            tone="scrim"
            style={[styles.tooltipBubble, { backgroundColor: theme.colors.inverseSurface }]}
          >
            <AppText testID="tooltip" style={{ color: theme.colors.inverseOnSurface }}>
              {title}
            </AppText>
          </OverlaySurface>
        </Animated.View>
      ) : null}
    </View>
  );
}

const baseFabStyle: ViewStyle = {
  position: getFloatingPosition(),
  bottom: 0,
  // Matches the list screens' Fab bottom offset (spacing.md) instead of a
  // stray 19 — see ActiveStreamBanner's clearance comment for the shared math.
  margin: spacing.md,
};

const styles = {
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
  tooltipAnchor: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: spacing.sm,
  } satisfies ViewStyle,
  tooltipBubble: {
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  } satisfies ViewStyle,
};
