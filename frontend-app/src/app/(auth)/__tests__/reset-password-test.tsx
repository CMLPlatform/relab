import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HttpResponse, http } from 'msw';
import { renderWithProviders } from '@/test-utils';
import { server } from '@/test-utils/server';
import ResetPasswordScreen from '../reset-password';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ token: 'valid-reset-token' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the Reset Password form', () => {
    renderWithProviders(<ResetPasswordScreen />);
    const elements = screen.getAllByText('Reset Password');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Reset Password form with inputs', () => {
    renderWithProviders(<ResetPasswordScreen />);
    const headings = screen.getAllByText('Reset Password');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('password-input')).toBeTruthy();
  });

  it('renders Back to Login button', () => {
    renderWithProviders(<ResetPasswordScreen />);
    expect(screen.getByText('Back to Login')).toBeTruthy();
  });
});
