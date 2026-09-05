import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { setStringAsync } from 'expo-clipboard';
import { ProfileSecuritySection } from '@/components/profile/SecuritySection';
import {
  confirmTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
  startTotpSetup,
} from '@/services/api/auth/authMfa';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('@/services/api/auth/authMfa', () => ({
  startTotpSetup: jest.fn(),
  confirmTotpSetup: jest.fn(),
  disableTotp: jest.fn(),
  regenerateRecoveryCodes: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

const mockStartTotpSetup = startTotpSetup as jest.MockedFunction<typeof startTotpSetup>;
const mockConfirmTotpSetup = confirmTotpSetup as jest.MockedFunction<typeof confirmTotpSetup>;
const mockDisableTotp = disableTotp as jest.MockedFunction<typeof disableTotp>;
const mockRegenerate = regenerateRecoveryCodes as jest.MockedFunction<
  typeof regenerateRecoveryCodes
>;
const mockSetStringAsync = setStringAsync as jest.MockedFunction<typeof setStringAsync>;

const RECOVERY_CODES = ['aaaa-1111', 'bbbb-2222'];
const onEnrolled = jest.fn();

function renderSection(mfaEnabled: boolean) {
  return renderWithProviders(
    <ProfileSecuritySection mfaEnabled={mfaEnabled} onEnrolled={onEnrolled} />,
    { withDialog: true },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStartTotpSetup.mockResolvedValue({
    setupToken: 'setup-token',
    secret: 'ABCDEFGH',
    otpauthUri: 'otpauth://totp/Relab:tester?secret=ABCDEFGH',
  });
  mockConfirmTotpSetup.mockResolvedValue(RECOVERY_CODES);
  mockRegenerate.mockResolvedValue(RECOVERY_CODES);
  mockDisableTotp.mockResolvedValue(undefined);
});

describe('ProfileSecuritySection enrolment', () => {
  it('enrols with a password and a setup code, then shows the recovery codes once', async () => {
    renderSection(false);

    fireEvent.press(screen.getByLabelText('Two-step verification'));

    expect(await screen.findByText('Set up two-step verification')).toBeOnTheScreen();
    // The shared key is shown in 4-char blocks so it can be typed by hand.
    expect(screen.getByText('ABCD EFGH')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Current password'), 'hunter2');
    // A full 6-digit code auto-submits, so no Confirm press is needed.
    fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    await waitFor(() =>
      expect(mockConfirmTotpSetup).toHaveBeenCalledWith('setup-token', '123456', 'hunter2'),
    );

    expect(await screen.findByText('Save your recovery codes')).toBeOnTheScreen();
    expect(screen.getByText('aaaa-1111')).toBeOnTheScreen();
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('does not submit the setup code until a password is given', async () => {
    renderSection(false);

    fireEvent.press(screen.getByLabelText('Two-step verification'));
    await screen.findByText('Set up two-step verification');

    fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    await waitFor(() => expect(mockConfirmTotpSetup).not.toHaveBeenCalled());
  });

  it('keeps the dialog open and reports the error when the setup code is rejected', async () => {
    mockConfirmTotpSetup.mockRejectedValue(new Error('Invalid code'));
    renderSection(false);

    fireEvent.press(screen.getByLabelText('Two-step verification'));
    await screen.findByText('Set up two-step verification');
    fireEvent.changeText(screen.getByLabelText('Current password'), 'hunter2');
    fireEvent.changeText(screen.getByLabelText('Authentication code'), '123456');

    expect(await screen.findByText('Invalid code')).toBeOnTheScreen();
    expect(screen.queryByText('Save your recovery codes')).toBeNull();
  });

  it('surfaces a failure to start enrolment', async () => {
    mockStartTotpSetup.mockRejectedValue(new Error('backend down'));
    renderSection(false);

    fireEvent.press(screen.getByLabelText('Two-step verification'));

    await waitFor(() => expect(mockStartTotpSetup).toHaveBeenCalled());
    expect(screen.queryByText('Set up two-step verification')).toBeNull();
  });
});

describe('ProfileSecuritySection management', () => {
  it('turns two-step verification off with a current code', async () => {
    renderSection(true);

    fireEvent.press(screen.getByLabelText('Turn off two-step verification'));

    expect(await screen.findByText('Enter a current code')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Authentication code'), '654321');

    await waitFor(() => expect(mockDisableTotp).toHaveBeenCalledWith('654321'));
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('accepts a recovery code instead when the authenticator is lost', async () => {
    renderSection(true);

    fireEvent.press(screen.getByLabelText('Turn off two-step verification'));
    await screen.findByText('Enter a current code');

    fireEvent.press(screen.getByText('Lost your authenticator? Use a recovery code'));
    fireEvent.changeText(screen.getByLabelText('Recovery code'), 'aaaa-1111');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockDisableTotp).toHaveBeenCalledWith('aaaa-1111'));
  });

  // Both branches of the toggle carry a visible label, so it can't appear and
  // disappear as the user switches between them.
  it('keeps a visible label on the code field in both authenticator and recovery mode', async () => {
    renderSection(true);

    fireEvent.press(screen.getByLabelText('Turn off two-step verification'));
    await screen.findByText('Enter a current code');
    expect(screen.getByText('Authentication code')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Lost your authenticator? Use a recovery code'));

    expect(screen.getByText('Recovery code')).toBeOnTheScreen();
    expect(screen.queryByText('Authentication code')).toBeNull();
  });

  it('regenerates recovery codes and lets the user copy them', async () => {
    renderSection(true);

    fireEvent.press(screen.getByLabelText('Generate new recovery codes'));
    fireEvent.changeText(await screen.findByLabelText('Authentication code'), '654321');

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledWith('654321'));
    expect(await screen.findByText('Save your recovery codes')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Copy all'));

    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalledWith(RECOVERY_CODES.join('\n')));
  });
});
