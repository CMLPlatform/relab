import { type RefObject, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { ControlledTextField } from '@/components/base/ControlledTextField';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { PageContainer } from '@/components/base/PageContainer';
import { Separator } from '@/components/base/ui/separator';
import { sanitizePairingCode, useAddCameraForm } from '@/features/cameras/useAddCameraForm';
import { useAppTheme } from '@/theme';

function PairingSuccessDialog({
  visible,
  onDismiss,
  triggerRef,
}: {
  visible: boolean;
  onDismiss: () => void;
  triggerRef: RefObject<View | null>;
}) {
  const theme = useAppTheme();
  return (
    <AppDialog visible={visible} onDismiss={onDismiss} triggerRef={triggerRef}>
      <View className="items-center gap-3 pt-6">
        <Animated.View
          entering={ZoomIn.duration(250)
            .withInitialValues({ transform: [{ scale: 0.92 }] })
            .reduceMotion(ReduceMotion.System)}
        >
          <Icon name="circle-check-big" size={56} color={theme.tokens.status.success} />
        </Animated.View>
        <AppText variant="title" accessibilityRole="header">
          Camera paired
        </AppText>
        <MutedText className="text-center opacity-70">
          Your camera should come online within a few seconds.
        </MutedText>
      </View>
      <View className="flex-row justify-end mt-4">
        <AppButton variant="ghost" onPress={onDismiss}>
          Done
        </AppButton>
      </View>
    </AppDialog>
  );
}

export default function AddCameraScreen() {
  const theme = useAppTheme();
  const { user, control, submit, isPending, pairingSuccess, dismissSuccess } = useAddCameraForm();
  const pairButtonRef = useRef<View>(null);

  if (!user) return null;

  return (
    <ScrollView contentContainerClassName="pt-4 pb-12" keyboardShouldPersistTaps="handled">
      <PageContainer>
        <View className="gap-3">
          <AppText variant="label" className="opacity-50 mb-1">
            PAIRING CODE
          </AppText>
          <MutedText className="mb-2 opacity-60">
            Enter the 6-character code shown on your Raspberry Pi setup page, or read the boxed
            “PAIRING READY” banner over SSH if the device is headless.
          </MutedText>
          <ControlledTextField
            control={control}
            name="pairingCode"
            transform={sanitizePairingCode}
            maxLength={6}
            autoCapitalize="characters"
            accessibilityLabel="Pairing code"
            className="mb-1 text-center"
            style={{ fontFamily: 'monospace', fontSize: 20 }}
          />

          <Separator className="my-1" />

          <AppText variant="label" className="opacity-60 -mb-1">
            Camera name *
          </AppText>
          <ControlledTextField
            control={control}
            name="name"
            maxLength={100}
            autoCapitalize="words"
            placeholder="Camera name"
            accessibilityLabel="Camera name, required"
            className="mb-1"
          />

          <AppText variant="label" className="opacity-60 -mb-1">
            Description (optional)
          </AppText>
          <ControlledTextField
            control={control}
            name="description"
            maxLength={500}
            multiline
            numberOfLines={2}
            placeholder="Description (optional)"
            accessibilityLabel="Description (optional)"
            className="mb-1"
          />

          <View
            className="flex-row items-start gap-2 p-3 rounded-lg"
            style={{ backgroundColor: theme.tokens.surface.accent }}
          >
            <Icon name="info" size={18} color={theme.colors.primary} />
            <AppText variant="body" className="flex-1 text-muted-foreground">
              Make sure your Raspberry Pi is powered on and has{' '}
              <AppText style={{ fontFamily: 'monospace', fontSize: 13 }}>
                PAIRING_BACKEND_URL
              </AppText>{' '}
              set in its .env file. The pairing code appears on the RPi setup page and in the
              startup logs.
            </AppText>
          </View>

          <View ref={pairButtonRef} collapsable={false}>
            <AppButton
              variant="primary"
              onPress={submit}
              loading={isPending}
              disabled={isPending}
              className="mt-2"
            >
              <Icon name="link" size={18} color={theme.colors.onPrimary} />
              <AppText className="text-primary-foreground">Pair camera</AppText>
            </AppButton>
          </View>

          <PairingSuccessDialog
            visible={pairingSuccess}
            onDismiss={dismissSuccess}
            triggerRef={pairButtonRef}
          />
        </View>
      </PageContainer>
    </ScrollView>
  );
}
