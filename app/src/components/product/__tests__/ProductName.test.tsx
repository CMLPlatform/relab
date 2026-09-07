import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { ProductNameHeader } from '@/components/product/ProductNameHeader';

const ELLIPSIS_END_PATTERN = /\.\.\.$/;

describe('ProductNameHeader', () => {
  it('renders the name as plain header text, never as an input', async () => {
    await render(<ProductNameHeader name="Initial product name" />);
    expect(screen.getByText('Initial product name')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Product name')).toBeNull();
  });

  it('truncates long names to fit the header', async () => {
    await render(<ProductNameHeader name={'x'.repeat(60)} />);
    expect(screen.getByText(ELLIPSIS_END_PATTERN)).toBeOnTheScreen();
  });
});
