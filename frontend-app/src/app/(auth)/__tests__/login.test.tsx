import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Login from '../login';
import { useRouter } from 'expo-router';
import { useDialog } from '@/components/common/DialogProvider';
import * as auth from '@/services/api/authentication';

jest.mock('expo-router');
jest.mock('@/components/common/DialogProvider');
jest.mock('@/services/api/authentication');
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return {
    ...Reanimated,
    useAnimatedSensor: jest.fn(() => ({
      sensor: { value: { pitch: 0, roll: 0 } },
    })),
    useAnimatedStyle: jest.fn(() => ({})),
    withSpring: jest.fn((value) => value),
  };
});

describe('Login Page', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  const mockDialog = {
    alert: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useDialog as jest.Mock).mockReturnValue(mockDialog);
    (auth.getToken as jest.Mock).mockResolvedValue(undefined);
  });

  it('should render login form', () => {
    const { getByPlaceholderText, getByText } = render(<Login />);

    expect(getByPlaceholderText('Email address')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
  });

  it('should render "Forgot Password?" and "Create a new account" buttons', () => {
    const { getByText } = render(<Login />);

    expect(getByText('Forgot Password?')).toBeTruthy();
    expect(getByText('Create a new account')).toBeTruthy();
  });

  it('should navigate to forgot password page when button is pressed', () => {
    const { getByText } = render(<Login />);

    fireEvent.press(getByText('Forgot Password?'));
    expect(mockRouter.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('should navigate to create account page when button is pressed', () => {
    const { getByText } = render(<Login />);

    fireEvent.press(getByText('Create a new account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/new-account');
  });

  it('should call login with credentials when login button is pressed', async () => {
    const mockToken = 'test-token';
    (auth.login as jest.Mock).mockResolvedValue(mockToken);

    const { getByPlaceholderText, getByText } = render(<Login />);

    const emailInput = getByPlaceholderText('Email address');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Login');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(auth.login).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('should navigate to products page on successful login', async () => {
    const mockToken = 'test-token';
    (auth.login as jest.Mock).mockResolvedValue(mockToken);

    const { getByPlaceholderText, getByText } = render(<Login />);

    const emailInput = getByPlaceholderText('Email address');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Login');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/products',
        params: { authenticated: 'true' },
      });
    });
  });

  it('should show alert on failed login', async () => {
    (auth.login as jest.Mock).mockResolvedValue(undefined);

    const { getByPlaceholderText, getByText } = render(<Login />);

    const emailInput = getByPlaceholderText('Email address');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Login');

    fireEvent.changeText(emailInput, 'wrong@example.com');
    fireEvent.changeText(passwordInput, 'wrongpassword');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(mockDialog.alert).toHaveBeenCalledWith({
        title: 'Login Failed',
        message: 'Invalid email or password.',
      });
    });
  });

  it('should show error alert on network error', async () => {
    (auth.login as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { getByPlaceholderText, getByText } = render(<Login />);

    const emailInput = getByPlaceholderText('Email address');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Login');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login Failed',
        })
      );
    });
  });

  it('should redirect to products if already authenticated', async () => {
    (auth.getToken as jest.Mock).mockResolvedValue('existing-token');

    render(<Login />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/products',
        params: { authenticated: 'true' },
      });
    });
  });
});
