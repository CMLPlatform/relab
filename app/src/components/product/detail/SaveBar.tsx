import { useEffect, useSyncExternalStore } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { IosAnnouncement } from '@/components/base/IosAnnouncement';
import { QUEUED_OFFLINE_LABEL } from '@/features/products/queries';
import {
  getImageUploadProgress,
  type ImageUploadProgress,
  subscribeToImageUploadProgress,
} from '@/services/api/saving';
import { useAppTheme } from '@/theme/appThemeContext';
import { visuallyHidden } from '@/utils/a11y';
import { getFloatingPosition } from '@/utils/platformLayout';

type SaveBarProps = {
  /** `flow` consumes screen height; `floating` retains the wide-web viewport dock. */
  layout?: 'flow' | 'floating';
  /** Extra bottom inset so the dock clears BottomNav (see FabControls). */
  bottomOffset: number;
  entityRole: 'product' | 'component';
  editMode: boolean;
  isDirty: boolean;
  isSaving: boolean;
  /** Mutation is paused offline (TanStack's `isPaused`): swaps the label, drops the spinner. */
  isPaused: boolean;
  validationValid: boolean;
  validationError?: string;
  errorCount?: number;
  onErrorSummaryPress?: () => void;
  onPrimaryPress: () => void;
  canModerate: boolean;
};

/**
 * Edit / Save / Done action bar plus an inline error summary. In normal flow below
 * md, docked to the viewport above. ActiveStreamBanner reserves dock space via
 * SAVE_BAR_DOCK_ROUTE; update it if the route or `canModerate` condition changes.
 */
export function SaveBar({
  layout = 'floating',
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
  canModerate,
}: SaveBarProps) {
  const uploadProgress = useSyncExternalStore(
    subscribeToImageUploadProgress,
    getImageUploadProgress,
    () => null,
  );
  if (!canModerate) return null;
  const titleLabel = entityRole === 'component' ? 'Component' : 'Product';
  // Validation only gates a press that would actually save dirty edits, not a
  // plain view->edit toggle.
  const wouldSave = editMode && isDirty;
  const needsAttention = wouldSave && !validationValid && (errorCount ?? 0) > 0;
  const blockedByValidation = wouldSave && !validationValid && !needsAttention;
  // Offline: the mutation is paused, not loading; no spinner.
  const isQueued = isSaving && isPaused;
  // Photos upload after the entity PATCH lands; worth naming only once there
  // is more than one in flight (see setImageUploadProgress).
  const uploadingPhotos = isSaving && !isPaused ? uploadProgress : null;
  // In the needsAttention state the entire press routes to the error summary
  // instead of saving invalid data.
  const onPrimaryButtonPress = needsAttention
    ? (onErrorSummaryPress ?? onPrimaryPress)
    : onPrimaryPress;
  // The card exists to seat the summary text beside the button; a lone button
  // carries its own ground, so the chrome would only frame empty padding.
  const showsMessage = blockedByValidation && Boolean(validationError);
  const uploadingText = uploadingPhotos
    ? `Uploading ${uploadingPhotos.current} of ${uploadingPhotos.total}…`
    : null;
  const showsSummary = needsAttention || showsMessage;
  const attentionText = needsAttention
    ? `${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`
    : null;
  return (
    // The dock itself animates: a transform on a wrapper would re-anchor its
    // `position: fixed` to that wrapper for the length of the slide.
    <Animated.View
      testID="save-bar-dock"
      entering={DOCK_ENTER}
      exiting={DOCK_EXIT}
      style={
        layout === 'flow'
          ? [flowStyle, { marginBottom: bottomOffset }]
          : [floatingStyle, { bottom: DOCK_BOTTOM + bottomOffset }]
      }
    >
      {/* Animated.View ignores className, so the row and its card sit one level in. */}
      <View
        testID="save-bar-row"
        style={layout === 'flow' ? flowRowStyle : undefined}
        className={`flex-row items-center justify-end gap-3${showsSummary ? ' rounded-lg border border-border bg-background px-4 py-2' : ''}`}
      >
        {/* NOTE: hand-rolled English plural. Swap it for
          Intl.PluralRules('en') behind a shared helper when the app gains a
          second locale; there is nothing to share until then. */}
        {/* Mounted even when empty: assistive tech only announces changes to a region it has seen. */}
        <View
          testID="save-bar-status"
          role="status"
          accessibilityLiveRegion="polite"
          // Out of flow when empty, so it adds no gap beside the button.
          style={showsMessage ? (layout === 'flow' ? flowSummaryStyle : undefined) : visuallyHidden}
        >
          <IosAnnouncement
            text={uploadingText ?? attentionText ?? (showsMessage ? validationError : undefined)}
          />
          {uploadingText ? (
            // The button label carries this visibly; the region makes it heard.
            <AppText style={visuallyHidden}>{uploadingText}</AppText>
          ) : null}
          {attentionText ? (
            // Same for the attention summary: the ghost button shows it, the region speaks it.
            <AppText style={visuallyHidden}>{attentionText}</AppText>
          ) : null}
          {showsMessage ? (
            <Animated.View
              testID="save-bar-validation-error"
              entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
            >
              <AppText variant="label" className="text-destructive">
                {validationError}
              </AppText>
            </Animated.View>
          ) : null}
        </View>
        {needsAttention ? (
          <Animated.View
            entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
            style={layout === 'flow' ? flowSummaryStyle : undefined}
          >
            <AppButton variant="ghost" onPress={onErrorSummaryPress ?? onPrimaryPress}>
              {attentionText}
            </AppButton>
          </Animated.View>
        ) : null}
        <View>
          <AppButton
            variant="primary"
            onPress={onPrimaryButtonPress}
            loading={isSaving && !isPaused}
            disabled={isSaving || blockedByValidation}
          >
            {/* Fields save on blur, so a clean edit form only needs closing. */}
            {isQueued
              ? QUEUED_OFFLINE_LABEL
              : (uploadingText ??
                (editMode ? (isDirty ? `Save ${titleLabel}` : 'Done') : `Edit ${titleLabel}`))}
          </AppButton>
          {uploadingPhotos ? <UploadProgressBar progress={uploadingPhotos} /> : null}
        </View>
      </View>
    </Animated.View>
  );
}

// Rises 12px into place as edit mode begins; leaves faster, by fading.
const DOCK_ENTER = FadeInDown.duration(200)
  .withInitialValues({ transform: [{ translateY: 12 }] })
  .reduceMotion(ReduceMotion.System);
const DOCK_EXIT = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

const PROGRESS_STEP = {
  duration: 300,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  reduceMotion: ReduceMotion.System,
};

/**
 * Hairline under the save button, filled by the photos already uploaded. It never
 * reaches full: `current` is the photo in flight, and the bar unmounts once the
 * last one lands.
 */
function UploadProgressBar({ progress }: { progress: ImageUploadProgress }) {
  const done = (progress.current - 1) / progress.total;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(done, PROGRESS_STEP);
  }, [done, fill]);
  // A full-width fill scaled from its left edge: a transform, not a width.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const { colors } = useAppTheme();

  return (
    // Decorative: the button label and the status region carry the count.
    // Absolute, just below the button, so it appears without pushing the bar taller.
    <View
      aria-hidden
      testID="upload-progress"
      className="absolute -bottom-1.5 left-0 right-0 h-0.5 overflow-hidden bg-primary/12"
    >
      {/* Animated.View ignores className, so the fill is styled inline. */}
      <Animated.View
        style={[
          { height: '100%', backgroundColor: colors.primary, transformOrigin: 'left' },
          fillStyle,
        ]}
      />
    </View>
  );
}

// 24px = right-6/bottom-6; getFloatingPosition() docks to the viewport ('fixed' on web).
const DOCK_BOTTOM = 24;
const floatingStyle: ViewStyle = {
  position: getFloatingPosition(),
  right: 24,
};

const flowStyle: ViewStyle = {
  width: '100%',
};

const flowRowStyle: ViewStyle = {
  flexWrap: 'wrap',
};

const flowSummaryStyle: ViewStyle = {
  flexBasis: '100%',
  flexShrink: 1,
};
