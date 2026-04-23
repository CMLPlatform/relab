import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { baseProduct as _base, renderWithProviders, setupUser } from '@/test-utils/index';

import type { Product } from '@/types/Product';
import ProductDelete from '../ProductDelete';

const existingProduct: Product = { ..._base, id: 42 };
const DELETE_CONFIRMATION_PATTERN = /Are you sure/;

describe('ProductDelete', () => {
  const user = setupUser();

  it("returns null when product.id is 'new'", () => {
    const product = { ...existingProduct, id: 'new' as const };
    renderWithProviders(<ProductDelete product={product} editMode={true} />, { withDialog: true });
    expect(screen.queryByText('Delete product')).toBeNull();
  });

  it('returns null when editMode is false', () => {
    renderWithProviders(<ProductDelete product={existingProduct} editMode={false} />, {
      withDialog: true,
    });
    expect(screen.queryByText('Delete product')).toBeNull();
  });

  it('renders the delete button for existing product in edit mode', () => {
    renderWithProviders(<ProductDelete product={existingProduct} editMode={true} />, {
      withDialog: true,
    });
    expect(screen.getByText('Delete product')).toBeOnTheScreen();
  });

  it('shows confirmation dialog when delete button is pressed', async () => {
    renderWithProviders(<ProductDelete product={existingProduct} editMode={true} />, {
      withDialog: true,
    });

    await user.press(screen.getByText('Delete product'));

    expect(screen.getByText('Delete Product')).toBeOnTheScreen();
    expect(screen.getByText(DELETE_CONFIRMATION_PATTERN)).toBeOnTheScreen();
  });

  it('pressing Cancel in the dialog does not call onDelete', async () => {
    const onDelete = jest.fn();
    renderWithProviders(
      <ProductDelete product={existingProduct} editMode={true} onDelete={onDelete} />,
      {
        withDialog: true,
      },
    );
    await user.press(screen.getByText('Delete product'));
    await user.press(screen.getByText('Cancel'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onDelete when Delete button in dialog is pressed', async () => {
    const onDelete = jest.fn();
    renderWithProviders(
      <ProductDelete product={existingProduct} editMode={true} onDelete={onDelete} />,
      {
        withDialog: true,
      },
    );

    await user.press(screen.getByText('Delete product'));

    await user.press(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
