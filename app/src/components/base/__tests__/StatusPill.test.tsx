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
  expect(StyleSheet.flatten(screen.getByText('LIVE').props.style).fontWeight).toBe('700');
});

test('soft variant uses a tinted fill with a border and non-bold text', () => {
  renderWithProviders(<StatusPill label="Warm" tone="info" variant="soft" testID="pill" />);
  const pill = StyleSheet.flatten(screen.getByTestId('pill').props.style);
  expect(pill.backgroundColor).toBeTruthy();
  expect(pill.borderWidth).toBe(1);
  expect(StyleSheet.flatten(screen.getByText('Warm').props.style).fontWeight).not.toBe('700');
});
