import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import ProductAmountInParent from '../ProductAmountInParent';
import { renderWithProviders, baseProduct as _base } from '@/test-utils';
import type { Product } from '@/types/Product';

const baseProduct: Product = {
  ..._base,
  name: 'Component',
  amountInParent: 3,
  physicalProperties: { weight: 10, width: 2, height: 2, depth: 2 },
};

describe('ProductAmountInParent', () => {
  it('displays the current amount in view mode', () => {
    renderWithProviders(<ProductAmountInParent product={baseProduct} editMode={false} onAmountChange={jest.fn()} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('defaults to 1 when amountInParent is undefined', () => {
    const product = { ...baseProduct, amountInParent: undefined };
    renderWithProviders(<ProductAmountInParent product={product} editMode={false} onAmountChange={jest.fn()} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows text input in edit mode', () => {
    renderWithProviders(<ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={jest.fn()} />);
    expect(screen.getByDisplayValue('3')).toBeTruthy();
  });

  it('calls onAmountChange when text input changes with valid value', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={onAmountChange} />,
    );
    fireEvent.changeText(screen.getByDisplayValue('3'), '7');
    expect(onAmountChange).toHaveBeenCalledWith(7);
  });

  it('calls onAmountChange with clamped value at max 10000 on blur', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={onAmountChange} />,
    );
    const input = screen.getByDisplayValue('3');
    fireEvent.changeText(input, '99999');
    fireEvent(input, 'blur');
    expect(onAmountChange).toHaveBeenCalledWith(10000);
  });

  it('resets to 1 on blur when input is empty', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={onAmountChange} />,
    );
    const input = screen.getByDisplayValue('3');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(onAmountChange).toHaveBeenCalledWith(1);
  });

  it('increment button calls onAmountChange with amount + 1', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={onAmountChange} />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[buttons.length - 1]); // plus is the last button
    expect(onAmountChange).toHaveBeenCalledWith(4);
  });

  it('decrement button calls onAmountChange with amount - 1', () => {
    const onAmountChange = jest.fn();
    renderWithProviders(
      <ProductAmountInParent product={baseProduct} editMode={true} onAmountChange={onAmountChange} />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[0]); // minus is the first button
    expect(onAmountChange).toHaveBeenCalledWith(2);
  });

  it('decrement button is disabled when amount is 1', () => {
    const product = { ...baseProduct, amountInParent: 1 };
    renderWithProviders(<ProductAmountInParent product={product} editMode={true} onAmountChange={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('increment button is disabled when amount is 10000', () => {
    const product = { ...baseProduct, amountInParent: 10000 };
    renderWithProviders(<ProductAmountInParent product={product} editMode={true} onAmountChange={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});
