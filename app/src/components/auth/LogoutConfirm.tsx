import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { Text } from '@/components/base/Text';
import { spacing } from '@/constants';

export default function LogoutConfirm({
  visible,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppDialog visible={visible} onDismiss={onDismiss}>
      <Text accessibilityRole="header" style={styles.title}>
        Sign out
      </Text>
      <Text>Are you sure you want to sign out?</Text>
      <View style={styles.actions}>
        <AppButton variant="ghost" onPress={onDismiss}>
          Cancel
        </AppButton>
        <AppButton variant="destructive" onPress={onConfirm}>
          Sign out
        </AppButton>
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
