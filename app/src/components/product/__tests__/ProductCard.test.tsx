import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import ProductCard from '@/components/product/ProductCard';
import { baseProduct, fireEvent, renderWithProviders, screen, setupUser } from '@/test-utils/index';

const TWO_MONTHS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
const MONTHS_AGO_PATTERN = /months? ago/i;
const AGO_PATTERN = /ago/i;
const OWNER_PATTERN = /you|alice/;
const EMPTY_SPEC_PATTERN = /\b0\b|unknown|missing|not measured/i;

describe('ProductCard', () => {
  const user = setupUser();
  it('renders name and description', async () => {
    await renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          description: 'A nice product',
          components: undefined,
          physicalProperties: { ...baseProduct.physicalProperties, weight: undefined },
        }}
      />,
    );
    expect(screen.getByText('Recycled Aluminum Laptop Stand')).toBeOnTheScreen();
    expect(screen.getByText('A nice product')).toBeOnTheScreen();
  });

  it('uses the existing secondary line for a measured mass', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, description: 'A nice product' }} />,
    );

    expect(screen.getByText('850 g')).toBeOnTheScreen();
    expect(screen.queryByText('A nice product')).toBeNull();
  });

  it('includes a positive component count only when components are loaded', async () => {
    const component = { ...baseProduct, id: 2, role: 'component' as const };
    await renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          physicalProperties: { ...baseProduct.physicalProperties, weight: undefined },
          components: [component],
        }}
      />,
    );

    expect(screen.getByText('1 component')).toBeOnTheScreen();
  });

  it('renders no zero or placeholder spec when facts are missing', async () => {
    await renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          description: undefined,
          components: undefined,
          physicalProperties: { ...baseProduct.physicalProperties, weight: undefined },
        }}
      />,
    );

    expect(screen.queryByText(EMPTY_SPEC_PATTERN)).toBeNull();
  });

  it('falls back to placeholder text for missing name', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, name: '', description: undefined }} />,
    );
    expect(screen.getByText('Unnamed Product')).toBeOnTheScreen();
  });

  it('renders detail line with brand and model', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, brand: 'CircularTech', model: 'V1' }} />,
    );
    expect(screen.getByText('CircularTech • V1')).toBeOnTheScreen();
  });

  it('includes productTypeName in the detail line', async () => {
    await renderWithProviders(
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

  it('shows thumbnail when thumbnailUrl is provided', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: 'http://example.com/img.png' }} />,
    );
    expect(
      screen.getByTestId('product-thumbnail', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('hides the decorative thumbnail from assistive tech since the name is shown as text', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: 'http://example.com/img.png' }} />,
    );
    // expo-image drops an empty alt, so the wrapper is aria-hidden instead.
    expect(screen.queryByTestId('product-thumbnail')).toBeNull();
    expect(
      screen.getByTestId('product-thumbnail', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('uses the placeholder thumbnail when thumbnailUrl is missing', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, thumbnailUrl: undefined }} />,
    );
    expect(screen.getByTestId('product-thumbnail')).toBeOnTheScreen();
  });

  it('falls back to the placeholder thumbnail when image loading fails', async () => {
    await renderWithProviders(
      <ProductCard
        product={{
          ...baseProduct,
          thumbnailUrl: 'http://example.com/broken.png',
        }}
      />,
    );

    await fireEvent(
      screen.getByTestId('product-thumbnail', { includeHiddenElements: true }),
      'error',
    );

    // The placeholder is not wrapped, so it is back in the default (a11y) tree.
    expect(screen.getByTestId('product-thumbnail')).toBeOnTheScreen();
  });

  it('shows relative creation date', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, createdAt: TWO_MONTHS_AGO }} />,
    );
    expect(screen.getByText(MONTHS_AGO_PATTERN)).toBeOnTheScreen();
  });

  // The timestamp sits inside the press target: pressing the "today" line
  // opens the record, so the card has no inert strip above the owner link.
  it('opens the product when the creation date is pressed', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, createdAt: TWO_MONTHS_AGO }} />,
    );
    await user.press(screen.getByText(MONTHS_AGO_PATTERN));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: String(baseProduct.id) },
    });
  });

  it('does not render a date for an invalid createdAt string', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, createdAt: 'not-a-date' }} />,
    );
    expect(screen.queryByText(AGO_PATTERN)).toBeNull();
  });

  it('shows "you" for own product when showOwner is true', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner />,
    );
    expect(screen.getByText('you')).toBeOnTheScreen();
  });

  it("shows username for another user's product when showOwner is true", async () => {
    await renderWithProviders(
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

  it('hides owner label when ownerUsername is absent', async () => {
    await renderWithProviders(
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

  it('hides owner label when showOwner is false', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, ownedBy: 'me' }} showOwner={false} />,
    );
    expect(screen.queryByText('you')).toBeNull();
  });

  it('navigates to the product detail page on press', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    await renderWithProviders(<ProductCard product={baseProduct} />);
    await user.press(screen.getByText('Recycled Aluminum Laptop Stand'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: String(baseProduct.id) },
    });
  });

  it('navigates to the component detail page for component entities', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    await renderWithProviders(
      <ProductCard product={{ ...baseProduct, role: 'component', parentID: 7 }} />,
    );
    await user.press(screen.getByText('Recycled Aluminum Laptop Stand'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/components/[id]',
      params: { id: String(baseProduct.id) },
    });
  });

  it('does not navigate when disabled', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

    await renderWithProviders(<ProductCard product={baseProduct} enabled={false} />);
    await user.press(screen.getByText('Recycled Aluminum Laptop Stand'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
