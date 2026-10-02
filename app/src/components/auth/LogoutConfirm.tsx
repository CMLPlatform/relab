import { useIsMutating } from '@tanstack/react-query';
import { type RefObject, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { heading } from '@/utils/a11y';

export default function LogoutConfirm({
  visible,
  onDismiss,
  onConfirm,
  triggerRef,
}: {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  triggerRef?: RefObject<View | null>;
}) {
  // Sign-out clears the query client, and with it any save or create still
  // queued offline. Say so before it happens.
  const live = useIsMutating({ predicate: (mutation) => mutation.state.isPaused });
  // Frozen while closing: confirming clears the queue mid-fade, and the copy
  // must not flip to the no-queue wording on its way out.
  const [shown, setShown] = useState(live);
  if (visible && shown !== live) setShown(live);
  const queued = visible ? live : shown;
  return (
    <AppDialog
      visible={visible}
      onDismiss={onDismiss}
      triggerRef={triggerRef}
      accessibilityLabel="Sign out"
    >
      <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
        Sign out
      </AppText>
      <AppText>
        {queued > 0
          ? `${queued} ${queued === 1 ? 'item is' : 'items are'} still waiting to send. Signing out now discards them.`
          : 'Are you sure you want to sign out?'}
      </AppText>
      <View style={dialogActionsStyle}>
        <AppButton variant="ghost" onPress={onDismiss}>
          Cancel
        </AppButton>
        <AppButton variant="destructive" onPress={onConfirm}>
          {queued > 0 ? 'Sign out anyway' : 'Sign out'}
        </AppButton>
      </View>
    </AppDialog>
  );
}
