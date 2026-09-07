import { fireEvent, screen } from '@testing-library/react-native';
import { ErrorState } from '@/components/base/ErrorState';
import { renderWithProviders } from '@/test-utils';

test('renders title, message, and custom action label', async () => {
  const onRetry = jest.fn();
  await renderWithProviders(
    <ErrorState
      title="Product not found"
      message="It may have been removed."
      onRetry={onRetry}
      actionLabel="Back to products"
    />,
  );
  expect(screen.getByText('Product not found')).toBeTruthy();
  expect(screen.getByText('It may have been removed.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Back to products'));
  expect(onRetry).toHaveBeenCalled();
});

test('never de-emphasizes the error message', async () => {
  await renderWithProviders(<ErrorState message="Something went wrong." onRetry={jest.fn()} />);
  const className = screen.getByText('Something went wrong.').props.className as string;
  expect(className).not.toEqual(expect.stringContaining('opacity'));
});
