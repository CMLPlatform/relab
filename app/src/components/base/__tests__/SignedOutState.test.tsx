import { fireEvent, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { SignedOutState } from '@/components/base/SignedOutState';
import { renderWithProviders } from '@/test-utils/index';

test('renders the default message and routes to login on sign-in press', () => {
  renderWithProviders(<SignedOutState />);
  expect(screen.getByText('Sign in to use this part of Relab.')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Sign in'));
  expect(useRouter().replace).toHaveBeenCalledWith('/login');
});

test('renders a custom message', () => {
  renderWithProviders(<SignedOutState message="Sign in to browse categories." />);
  expect(screen.getByText('Sign in to browse categories.')).toBeOnTheScreen();
});
