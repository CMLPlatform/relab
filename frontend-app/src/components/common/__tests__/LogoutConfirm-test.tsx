import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import LogoutConfirm from '../LogoutConfirm';

describe('LogoutConfirm', () => {
  it('renders the logout dialog when visible', () => {
    renderWithProviders(<LogoutConfirm visible onDismiss={jest.fn()} onConfirm={jest.fn()} />, {
      withDialog: true,
    });
    // "Logout" appears in both the Dialog.Title and the confirm button
    expect(screen.getAllByText('Logout').length).toBeGreaterThan(0);
    expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
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

  it('calls onDismiss when Cancel is pressed', () => {
    const onDismiss = jest.fn();
    renderWithProviders(<LogoutConfirm visible onDismiss={onDismiss} onConfirm={jest.fn()} />, {
      withDialog: true,
    });
    fireEvent.press(screen.getByText('Cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Logout button is pressed', () => {
    const onConfirm = jest.fn();
    renderWithProviders(<LogoutConfirm visible onDismiss={jest.fn()} onConfirm={onConfirm} />, {
      withDialog: true,
    });
    // getAllByText returns [title, button]; press the last element (the button)
    const items = screen.getAllByText('Logout');
    fireEvent.press(items[items.length - 1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
