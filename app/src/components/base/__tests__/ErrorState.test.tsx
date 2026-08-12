import { fireEvent, screen } from '@testing-library/react-native';
import { ErrorState } from '@/components/base/ErrorState';
import { renderWithProviders } from '@/test-utils';

test('renders title, message, and custom action label', () => {
  const onRetry = jest.fn();
  renderWithProviders(
    <ErrorState
      title="Product not found"
      message="It may have been removed."
      onRetry={onRetry}
      actionLabel="Back to products"
    />,
  );
  expect(screen.getByText('Product not found')).toBeTruthy();
  expect(screen.getByText('It may have been removed.')).toBeTruthy();
  fireEvent.press(screen.getByText('Back to products'));
  expect(onRetry).toHaveBeenCalled();
});
