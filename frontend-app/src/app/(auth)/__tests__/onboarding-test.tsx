import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import Onboarding from '../onboarding';
import { useAuth } from '@/context/AuthProvider';
import { renderWithProviders } from '@/test-utils';
import * as auth from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockReplace = jest.fn();
const mockRefetch = jest.fn();
const mockedUpdateUser = jest.mocked(auth.updateUser);

describe('Onboarding screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (useAuth as jest.Mock).mockReturnValue({
      refetch: mockRefetch,
    });
  });

  it('renders the Welcome text and Continue button', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Welcome!')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('shows dialog when username is too short', async () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'a');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Invalid Username')).toBeTruthy();
    });
  });

  it('calls updateUser with username on valid submit', async () => {
    mockedUpdateUser.mockResolvedValue({ username: 'newuser' } as Awaited<ReturnType<typeof auth.updateUser>>);
    renderWithProviders(<Onboarding />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'newuser');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(auth.updateUser).toHaveBeenCalledWith({ username: 'newuser' });
    });
  });

  it('redirects to products on successful username save', async () => {
    mockedUpdateUser.mockResolvedValue({ username: 'newuser' } as Awaited<ReturnType<typeof auth.updateUser>>);
    renderWithProviders(<Onboarding />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'newuser');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalledWith(false);
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/products' }));
    });
  });

  it('shows error dialog when updateUser throws', async () => {
    mockedUpdateUser.mockRejectedValue(new Error('Username taken'));
    renderWithProviders(<Onboarding />, { withDialog: true });
    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'taken_name');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeTruthy();
    });
  });
});
