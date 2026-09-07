import { screen } from '@testing-library/react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { renderWithProviders } from '@/test-utils/index';

test('exposes a busy progressbar for screen readers', () => {
  renderWithProviders(<CenteredSpinner />);
  expect(screen.getByRole('progressbar').props.accessibilityState).toEqual(
    expect.objectContaining({ busy: true }),
  );
});
