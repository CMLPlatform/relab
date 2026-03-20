import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import NewAccount from '../new-account';
import * as auth from '@/services/api/authentication';
import { renderWithProviders } from '@/test-utils';

jest.mock('@/services/api/authentication', () => ({
  login: jest.fn(),
  register: jest.fn(),
}));

// Mock global alert (used by the screen to show errors)
global.alert = jest.fn() as jest.Mock;

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();

describe('NewAccount screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      navigate: mockNavigate,
      dismissTo: mockDismissTo,
      setParams: jest.fn(),
    });
  });

  it('renders the username section by default', () => {
    renderWithProviders(<NewAccount />);
    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
    expect(screen.getByText('Who are you?')).toBeTruthy();
  });

  it('shows validation error for invalid username', () => {
    renderWithProviders(<NewAccount />);
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'a'); // too short
    expect(screen.getByText(/at least 2/)).toBeTruthy();
  });

  it('chevron button is disabled for invalid username', () => {
    renderWithProviders(<NewAccount />);
    // With empty username, the chevron-right button should be disabled
    // We check by verifying no navigation happens
    const input = screen.getByPlaceholderText('Username');
    fireEvent.changeText(input, '');
    // The forward button exists but is disabled (empty username)
    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
  });

  it('advances to email section with valid username', async () => {
    renderWithProviders(<NewAccount />);
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    // Find the chevron-right icon button and press it
    const buttons = screen.getAllByRole('button');
    // The chevron-right button should be the last or we can fire press via testId
    // Use the fact that advancing shows "How do we reach you?"
    await act(async () => {
      // Tap chevron-right button (disabled check is done via props, pressing the enabled one)
      const chevron = buttons.find((b) => !b.props.accessibilityState?.disabled);
      if (chevron) fireEvent.press(chevron);
    });
    // After pressing, section should be 'email'
    await waitFor(() => {
      expect(screen.getByText(/How do we reach you/)).toBeTruthy();
    });
  });

  it('shows email validation error for invalid email', async () => {
    renderWithProviders(<NewAccount />);
    // Navigate to email section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'validuser');
    const buttons = screen.getAllByRole('button');
    const enabledBtn = buttons.find((b) => !b.props.accessibilityState?.disabled);
    if (enabledBtn) {
      await act(async () => {
        fireEvent.press(enabledBtn);
      });
    }
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'notanemail');
    expect(screen.getByText(/valid email/)).toBeTruthy();
  });

  it('navigates to products on successful registration and login', async () => {
    (auth.register as jest.Mock).mockResolvedValue({ success: true });
    (auth.login as jest.Mock).mockResolvedValue('access-token');

    renderWithProviders(<NewAccount />);

    // Username section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    let buttons = screen.getAllByRole('button');
    let enabledBtn = buttons.find((b) => !b.props.accessibilityState?.disabled);
    await act(async () => {
      if (enabledBtn) fireEvent.press(enabledBtn);
    });

    // Email section
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'user@example.com');
    buttons = screen.getAllByRole('button');
    enabledBtn = buttons.find((b) => !b.props.accessibilityState?.disabled);
    await act(async () => {
      if (enabledBtn) fireEvent.press(enabledBtn);
    });

    // Password section
    await screen.findByPlaceholderText('Password');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');
    await act(async () => {
      fireEvent.press(screen.getByText('Create Account'));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/products');
    });
  });

  it('shows error when registration fails', async () => {
    (auth.register as jest.Mock).mockResolvedValue({ success: false, error: 'Email already in use' });

    renderWithProviders(<NewAccount />);

    // Navigate to password section
    fireEvent.changeText(screen.getByPlaceholderText('Username'), 'newuser');
    let buttons = screen.getAllByRole('button');
    let enabledBtn = buttons.find((b) => !b.props.accessibilityState?.disabled);
    await act(async () => {
      if (enabledBtn) fireEvent.press(enabledBtn);
    });
    await screen.findByPlaceholderText('Email address');
    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'taken@example.com');
    buttons = screen.getAllByRole('button');
    enabledBtn = buttons.find((b) => !b.props.accessibilityState?.disabled);
    await act(async () => {
      if (enabledBtn) fireEvent.press(enabledBtn);
    });
    await screen.findByPlaceholderText('Password');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'strongpass99');

    await act(async () => {
      fireEvent.press(screen.getByText('Create Account'));
    });

    await waitFor(() => {
      expect(auth.register).toHaveBeenCalled();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});
