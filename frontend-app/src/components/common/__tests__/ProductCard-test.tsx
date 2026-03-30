import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import { baseProduct, fireEvent, renderWithProviders, screen } from '@/test-utils';
import ProductCard from '../ProductCard';

const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

describe('ProductCard', () => {
  it('renders name and description', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, description: 'A nice product' }} />,
    );
    expect(screen.getByText('Test Product')).toBeTruthy();
    expect(screen.getByText('A nice product')).toBeTruthy();
  });

  it('falls back to placeholder text for missing name', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, name: '', description: undefined }} />,
    );
    expect(screen.getByText('Unnamed Product')).toBeTruthy();
  });

  it('renders detail line with brand and model', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, brand: 'Acme', model: 'V1' }} />);
    expect(screen.getByText('Acme • V1')).toBeTruthy();
  });

  it('includes productTypeName in the detail line', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, brand: 'Acme', productTypeName: 'Electronics' }} />,
    );
    expect(screen.getByText('Acme • Electronics')).toBeTruthy();
  });

  it('shows thumbnail when thumbnailUrl is provided', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: 'http://example.com/img.png' }} />,
    );
    expect(screen.getByTestId('product-thumbnail')).toBeTruthy();
  });

  it('uses the placeholder thumbnail when thumbnailUrl is missing', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, thumbnailUrl: undefined }} />);
    expect(screen.getByTestId('product-thumbnail')).toBeTruthy();
  });

  it('falls back to the placeholder thumbnail when image loading fails', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: 'http://example.com/broken.png' }} />,
    );

    fireEvent(screen.getByTestId('product-thumbnail'), 'error');

    expect(screen.getByTestId('product-thumbnail')).toBeTruthy();
  });

  it('shows relative creation date', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, createdAt: TWO_MONTHS_AGO }} />);
    expect(screen.getByText(/months? ago/i)).toBeTruthy();
  });

  it('does not render a date for an invalid createdAt string', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, createdAt: 'not-a-date' }} />);
    expect(screen.queryByText(/ago/i)).toBeNull();
  });

  it('shows "you" for own product when showOwner is true', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner />);
    expect(screen.getByText('you')).toBeTruthy();
  });

  it("shows username for another user's product when showOwner is true", () => {
    renderWithProviders(
      <ProductCard
        product={{ ...baseProduct, ownedBy: 'some-uuid', ownerUsername: 'alice' }}
        showOwner
      />,
    );
    expect(screen.getByText('alice')).toBeTruthy();
  });

  it('hides owner label when ownerUsername is absent', () => {
    renderWithProviders(
      <ProductCard
        product={{ ...baseProduct, ownedBy: 'some-uuid', ownerUsername: undefined }}
        showOwner
      />,
    );
    expect(screen.queryByText(/you|alice/)).toBeNull();
  });

  it('hides owner label when showOwner is false', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner={false} />,
    );
    expect(screen.queryByText('you')).toBeNull();
  });

  it('navigates to the product detail page on press', () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    renderWithProviders(<ProductCard product={baseProduct} />);
    fireEvent.press(screen.getByText('Test Product'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: baseProduct.id },
    });
  });

  it('does not navigate when disabled', () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    renderWithProviders(<ProductCard product={baseProduct} enabled={false} />);
    fireEvent.press(screen.getByText('Test Product'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
