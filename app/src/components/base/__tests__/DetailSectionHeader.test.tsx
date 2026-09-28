import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { renderWithProviders } from '@/test-utils/render';

describe('DetailSectionHeader', () => {
  it('renders its title as a level-3 heading, a step below the Section card title', async () => {
    await renderWithProviders(<DetailSectionHeader title="Product type" />);
    const title = screen.getByRole('header', { name: 'Product type' });
    expect(title.props['aria-level']).toBe(3);
  });
});
