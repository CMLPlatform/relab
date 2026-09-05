import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StatusPill } from '@/components/base/StatusPill';
import { renderWithProviders } from '@/test-utils/index';

test('renders the label', () => {
  renderWithProviders(<StatusPill label="LIVE" tone="live" />);
  expect(screen.getByText('LIVE')).toBeOnTheScreen();
});

test('solid variant fills with a background and bold text, no border', () => {
  renderWithProviders(<StatusPill label="LIVE" tone="live" testID="pill" />);
  const pill = StyleSheet.flatten(screen.getByTestId('pill').props.style);
  expect(pill.backgroundColor).toBeTruthy();
  expect(pill.borderWidth).toBeFalsy();
  expect((screen.getByText('LIVE').props.className as string).includes('font-bold')).toBe(true);
});

test('soft variant uses a tinted fill with a border and non-bold text', () => {
  renderWithProviders(<StatusPill label="Warm" tone="info" variant="soft" testID="pill" />);
  const pill = StyleSheet.flatten(screen.getByTestId('pill').props.style);
  expect(pill.backgroundColor).toBeTruthy();
  expect(pill.borderWidth).toBe(1);
  expect((screen.getByText('Warm').props.className as string).includes('font-bold')).toBe(false);
});
