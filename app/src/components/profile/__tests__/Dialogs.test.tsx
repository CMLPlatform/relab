import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { ProfileDialogs } from '@/components/profile/Dialogs';
import { queryAllHostsByType } from '@/test-utils/host';
import { renderWithProviders } from '@/test-utils/index';

function renderDeleteDialog(overrides: Partial<ComponentProps<typeof ProfileDialogs>> = {}) {
  return renderWithProviders(
    <ProfileDialogs
      unlinkDialogVisible={false}
      onDismissUnlink={jest.fn()}
      providerToUnlink=""
      onConfirmUnlink={jest.fn()}
      isLastLinkedProvider={false}
      unlinkRequiresPassword={false}
      unlinkPassword=""
      onChangeUnlinkPassword={jest.fn()}
      logoutDialogVisible={false}
      onDismissLogout={jest.fn()}
      onConfirmLogout={jest.fn()}
      deleteDialogVisible
      onDismissDeleteDialog={jest.fn()}
      onConfirmDelete={jest.fn()}
      deleteRequiresPassword
      deletePassword="my-password"
      onChangeDeletePassword={jest.fn()}
      deleteRequiresMfa={false}
      deleteMfaCode=""
      onChangeDeleteMfaCode={jest.fn()}
      deletePending={false}
      {...overrides}
    />,
  );
}

describe('delete account dialog', () => {
  it('shows the confirm button as loading, and not pressable, while the deletion runs', async () => {
    await renderDeleteDialog({ deletePending: true });

    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
    // The spinner is what tells the user the press registered.
    expect(queryAllHostsByType('ActivityIndicator')).toHaveLength(1);
  });

  it('ties a password error to the password field', async () => {
    await renderDeleteDialog({
      deleteError: { field: 'password', message: 'Current password is invalid.' },
    });

    expect(screen.getByText('Current password is invalid.')).toBeTruthy();
    expect(screen.getByLabelText('Current password').props.accessibilityDescribedBy).toBe(
      'delete-password-error',
    );
    expect(queryAllHostsByType('ActivityIndicator')).toHaveLength(0);
  });

  it('shows a field error at the dialog level when that field is not shown', async () => {
    await renderDeleteDialog({
      deleteRequiresPassword: false,
      deleteError: { field: 'password', message: 'Current password is invalid.' },
    });

    expect(screen.getByText('Current password is invalid.')).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });
});
