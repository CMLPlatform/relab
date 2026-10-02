import { render, screen } from '@testing-library/react-native';
import { SpecFacts } from '@/components/base/SpecFacts';

test('renders label/value pairs', async () => {
  await render(
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

test('renders nothing for empty facts', async () => {
  await render(<SpecFacts facts={[]} />);
  expect(screen.toJSON()).toBeNull();
});

test('keeps the labels and pulses each value while loading', async () => {
  await render(
    <SpecFacts
      loading
      facts={[
        { label: 'Products', value: '0' },
        { label: 'Top category', value: '—' },
      ]}
    />,
  );
  expect(screen.getByText('Top category')).toBeOnTheScreen();
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.getAllByTestId('spec-fact-skeleton')).toHaveLength(2);
});
