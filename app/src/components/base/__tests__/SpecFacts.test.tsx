import { render, screen } from '@testing-library/react-native';
import { SpecFacts } from '@/components/base/SpecFacts';

test('renders label/value pairs', () => {
  render(
    <SpecFacts
      facts={[
        { label: 'Components', value: '8' },
        { label: 'Weight', value: '1.2 kg' },
      ]}
    />,
  );
  expect(screen.getByText('Components')).toBeOnTheScreen();
  expect(screen.getByText('1.2 kg')).toBeOnTheScreen();
});

test('renders nothing for empty facts', () => {
  render(<SpecFacts facts={[]} />);
  expect(screen.toJSON()).toBeNull();
});
