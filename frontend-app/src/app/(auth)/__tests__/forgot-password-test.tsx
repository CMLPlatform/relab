import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { HttpResponse, http } from 'msw';
import { renderWithProviders } from '@/test-utils';
import { server } from '@/test-utils/server';
import ForgotPasswordScreen from '../forgot-password';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api';

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders the forgot password form', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    expect(screen.getByText('Forgot Password')).toBeTruthy();
    expect(screen.getByText('Send Reset Link')).toBeTruthy();
  });

  it('renders Forgot Password form with inputs', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    expect(screen.getByText('Forgot Password')).toBeTruthy();
    expect(screen.getByTestId('text-input-flat')).toBeTruthy();
  });

  it('renders Send Reset Link button', () => {
    renderWithProviders(<ForgotPasswordScreen />);
    expect(screen.getByText('Send Reset Link')).toBeTruthy();
  });

  it('back to login button calls router.back', () => {
    const mockBack = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: mockBack,
      setParams: jest.fn(),
    });
    renderWithProviders(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Back to Login'));
    expect(mockBack).toHaveBeenCalled();
  });
});
