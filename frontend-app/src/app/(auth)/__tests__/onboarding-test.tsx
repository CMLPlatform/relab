import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthProvider';
import { renderWithProviders } from '@/test-utils';
import Onboarding from '../onboarding';
import { updateUser } from '@/services/api/authentication';

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockReplace = jest.fn();
const mockRefetch = jest.fn();
const mockedUpdateUser = jest.mocked(updateUser);

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
      user: null,
      isLoading: false,
    });
  });

  it('renders the Welcome text and Continue button', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Welcome!')).toBeOnTheScreen();
    expect(screen.getByText('Continue')).toBeOnTheScreen();
  });

  it('renders the Welcome text and username input', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Welcome!')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('e.g. awesome_user')).toBeOnTheScreen();
  });

  it('renders Continue button', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Continue')).toBeOnTheScreen();
  });

  it('saves the username and routes into the authenticated flow', async () => {
    mockedUpdateUser.mockResolvedValue(undefined);

    renderWithProviders(<Onboarding />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'new_user');
    fireEvent(screen.getByPlaceholderText('e.g. awesome_user'), 'submitEditing');

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({ username: 'new_user' });
      expect(mockRefetch).toHaveBeenCalledWith(false);
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/products',
        params: { authenticated: 'true' },
      });
    });
  });

  it('shows an error dialog when onboarding fails', async () => {
    mockedUpdateUser.mockRejectedValue(new Error('Username already exists'));

    renderWithProviders(<Onboarding />, { withDialog: true });

    fireEvent.changeText(screen.getByPlaceholderText('e.g. awesome_user'), 'taken_name');
    fireEvent(screen.getByPlaceholderText('e.g. awesome_user'), 'submitEditing');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeOnTheScreen();
      expect(screen.getByText('Username already exists')).toBeOnTheScreen();
    });
  });
});
