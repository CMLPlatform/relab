import { fireEvent, render, screen } from '@testing-library/react-native';
import { AmountStepper } from '@/components/base/AmountStepper';

test('increments and decrements', () => {
  const onChange = jest.fn();
  render(<AmountStepper value={3} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText('Increase amount'));
  expect(onChange).toHaveBeenCalledWith(4);
  fireEvent.press(screen.getByLabelText('Decrease amount'));
  expect(onChange).toHaveBeenCalledWith(2);
});

test('decrement disabled at min', () => {
  const onChange = jest.fn();
  render(<AmountStepper value={1} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText('Decrease amount'));
  expect(onChange).not.toHaveBeenCalled();
});

test('renders label and value', () => {
  render(<AmountStepper value={8} onChange={jest.fn()} label="Amount in parent" />);
  expect(screen.getByText('Amount in parent')).toBeOnTheScreen();
  expect(screen.getByText('8')).toBeOnTheScreen();
});
