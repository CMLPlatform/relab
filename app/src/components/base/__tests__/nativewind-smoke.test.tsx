import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

test('className prop is accepted on core components', () => {
  render(<View testID="nw-smoke" className="p-4 bg-red-500" />);
  expect(screen.getByTestId('nw-smoke')).toBeOnTheScreen();
});
