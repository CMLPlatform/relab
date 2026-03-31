import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthProvider';
import * as auth from '@/services/api/authentication';
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
      user: null,
      isLoading: false,
    });
  });

  it('renders the Welcome text and Continue button', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Welcome!')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('renders the Welcome text and username input', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Welcome!')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. awesome_user')).toBeTruthy();
  });

  it('renders Continue button', () => {
    renderWithProviders(<Onboarding />, { withDialog: true });
    expect(screen.getByText('Continue')).toBeTruthy();
  });
});
