import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { MissingFieldsNotice } from '@/components/product/detail/MissingFieldsNotice';
import type { MissingField } from '@/features/products/missingFields';
import { renderWithProviders } from '@/test-utils/index';

const fields: MissingField[] = [
  { id: 'brand', label: 'brand', target: 'overview', missing: () => true },
  { id: 'photo', label: 'a photo', target: 'gallery', missing: () => true },
];

describe('MissingFieldsNotice', () => {
  it('leads with "Not recorded yet:" and gives each item a tap-target height', async () => {
    await renderWithProviders(<MissingFieldsNotice fields={fields} onPressField={jest.fn()} />);

    expect(screen.getByText('Not recorded yet:')).toBeOnTheScreen();
    for (const field of fields) {
      expect(screen.getByLabelText(`Jump to ${field.label}`).props.className).toContain('min-h-11');
    }
  });
});
