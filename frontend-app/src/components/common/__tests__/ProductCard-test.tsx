import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import { baseProduct, fireEvent, renderWithProviders, screen, setupUser } from '@/test-utils/index';
import ProductCard from '../ProductCard';

const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
const MONTHS_AGO_PATTERN = /months? ago/i;
const AGO_PATTERN = /ago/i;
const OWNER_PATTERN = /you|alice/;

describe('ProductCard', () => {
  const user = setupUser();
  it('renders name and description', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, description: 'A nice product' }} />,
    );
    expect(screen.getByText('Recycled Aluminum Laptop Stand')).toBeOnTheScreen();
    expect(screen.getByText('A nice product')).toBeOnTheScreen();
  });

  it('falls back to placeholder text for missing name', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, name: '', description: undefined }} />,
    );
    expect(screen.getByText('Unnamed Product')).toBeOnTheScreen();
  });

  it('renders detail line with brand and model', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, brand: 'CircularTech', model: 'V1' }} />,
    );
    expect(screen.getByText('CircularTech • V1')).toBeOnTheScreen();
  });

  it('includes productTypeName in the detail line', () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          brand: 'CircularTech',
          productTypeName: 'Electronics',
        }}
      />,
    );
    expect(screen.getByText('CircularTech • Electronics')).toBeOnTheScreen();
  });

  it('shows thumbnail when thumbnailUrl is provided', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: 'http://example.com/img.png' }} />,
    );
    expect(screen.getByTestId('product-thumbnail')).toBeOnTheScreen();
  });

  it('uses the placeholder thumbnail when thumbnailUrl is missing', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, thumbnailUrl: undefined }} />);
    expect(screen.getByTestId('product-thumbnail')).toBeOnTheScreen();
  });

  it('falls back to the placeholder thumbnail when image loading fails', () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          thumbnailUrl: 'http://example.com/broken.png',
        }}
      />,
    );

    fireEvent(screen.getByTestId('product-thumbnail'), 'error');

    expect(screen.getByTestId('product-thumbnail')).toBeOnTheScreen();
  });

  it('shows relative creation date', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, createdAt: TWO_MONTHS_AGO }} />);
    expect(screen.getByText(MONTHS_AGO_PATTERN)).toBeOnTheScreen();
  });

  it('does not render a date for an invalid createdAt string', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, createdAt: 'not-a-date' }} />);
    expect(screen.queryByText(AGO_PATTERN)).toBeNull();
  });

  it('shows "you" for own product when showOwner is true', () => {
    renderWithProviders(<ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner />);
    expect(screen.getByText('you')).toBeOnTheScreen();
  });

  it("shows username for another user's product when showOwner is true", () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          ownedBy: 'some-uuid',
          ownerUsername: 'alice',
        }}
        showOwner
      />,
    );
    expect(screen.getByText('alice')).toBeOnTheScreen();
  });

  it('hides owner label when ownerUsername is absent', () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          ownedBy: 'some-uuid',
          ownerUsername: undefined,
        }}
        showOwner
      />,
    );
    expect(screen.queryByText(OWNER_PATTERN)).toBeNull();
  });

  it('hides owner label when showOwner is false', () => {
    renderWithProviders(
      <ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner={false} />,
    );
    expect(screen.queryByText('you')).toBeNull();
  });

  it('navigates to the product detail page on press', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    renderWithProviders(<ProductCard product={baseProduct} />);
    await user.press(screen.getByText('Recycled Aluminum Laptop Stand'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: baseProduct.id },
    });
  });

  it('does not navigate when disabled', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    renderWithProviders(<ProductCard product={baseProduct} enabled={false} />);
    await user.press(screen.getByText('Recycled Aluminum Laptop Stand'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
