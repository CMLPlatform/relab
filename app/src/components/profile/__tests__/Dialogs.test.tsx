import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ProfileDialogs } from '@/components/profile/Dialogs';
import { queryAllHostsByType } from '@/test-utils/host';
import { renderWithProviders } from '@/test-utils/index';

describe('delete account dialog', () => {
  it('shows the confirm button as loading, and not pressable, while the deletion runs', async () => {
    await renderWithProviders(
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
        deleteDialog={{
          visible: true,
          close: jest.fn(),
          password: 'my-password',
          setPassword: jest.fn(),
          mfaCode: '',
          setMfaCode: jest.fn(),
          pending: true,
          error: null,
        }}
        onConfirmDelete={jest.fn()}
        deleteRequiresPassword
        deleteRequiresMfa={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
    // The spinner is what tells the user the press registered.
    expect(queryAllHostsByType('ActivityIndicator')).toHaveLength(1);
  });
});
