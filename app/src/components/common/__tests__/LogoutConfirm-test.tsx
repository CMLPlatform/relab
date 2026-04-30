import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { renderWithProviders, setupUser } from '@/test-utils/index';
import LogoutConfirm from '../LogoutConfirm';

describe('LogoutConfirm', () => {
  const user = setupUser();

  it('renders the logout dialog when visible', () => {
    renderWithProviders(<LogoutConfirm visible onDismiss={jest.fn()} onConfirm={jest.fn()} />, {
      withDialog: true,
    });
    expect(screen.getAllByText('Logout').length).toBeGreaterThan(0);
    expect(screen.getByText('Are you sure you want to log out?')).toBeOnTheScreen();
  });

  it('does not render dialog content when not visible', () => {
    renderWithProviders(
      <LogoutConfirm visible={false} onDismiss={jest.fn()} onConfirm={jest.fn()} />,
      {
        withDialog: true,
      },
    );
    expect(screen.queryByText('Are you sure you want to log out?')).toBeNull();
  });

  it('calls onDismiss when Cancel is pressed', async () => {
    const onDismiss = jest.fn();
    renderWithProviders(<LogoutConfirm visible onDismiss={onDismiss} onConfirm={jest.fn()} />, {
      withDialog: true,
    });
    await user.press(screen.getByText('Cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Logout button is pressed', async () => {
    const onConfirm = jest.fn();
    renderWithProviders(<LogoutConfirm visible onDismiss={jest.fn()} onConfirm={onConfirm} />, {
      withDialog: true,
    });
    const items = screen.getAllByText('Logout');
    await user.press(items[items.length - 1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
