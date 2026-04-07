import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthProvider';
import { renderWithProviders } from '@/test-utils';
import Onboarding from '../onboarding';

jest.mock('@/services/api/authentication', () => ({
  updateUser: jest.fn(),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const mockReplace = jest.fn();
const mockRefetch = jest.fn();

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
});
