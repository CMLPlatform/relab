import { screen } from '@testing-library/react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { renderWithProviders } from '@/test-utils/index';

test('exposes a busy progressbar for screen readers', async () => {
  await renderWithProviders(<CenteredSpinner />);
  // aria-busy, not accessibilityState: react-native-web reads only the aria prop, and
  // RN maps it to the native busy state.
  expect(screen.getByRole('progressbar').props['aria-busy']).toBe(true);
});
