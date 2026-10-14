import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { DisclosureRow } from '@/components/base/DisclosureRow';
import { renderWithProviders } from '@/test-utils/index';

describe('DisclosureRow', () => {
  // The chevron's turn is visual only; the button itself has to carry the state.
  it('exposes its expanded state on the button', async () => {
    await renderWithProviders(
      <DisclosureRow label="Show 3 more components" expanded={false} onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Show 3 more components' })).toBeCollapsed();

    await screen.rerender(
      <DisclosureRow label="Show 3 more components" expanded onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Show 3 more components' })).toBeExpanded();
  });
});
