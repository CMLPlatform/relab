import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { ProductPageContent } from '@/components/product/detail/Content';
import { baseProduct, renderWithProviders } from '@/test-utils/index';

const noop = () => {};

function renderContent(overrides: Partial<Parameters<typeof ProductPageContent>[0]> = {}) {
  return renderWithProviders(
    <ProductPageContent
      product={baseProduct}
      editMode={false}
      canEdit
      editingOthersProduct={false}
      isProductComponent={false}
      isLab={false}
      mediaStreamable={false}
      hasResearchFiles={false}
      scrollRef={{ current: null }}
      onScroll={noop}
      onImagesChange={jest.fn()}
      onProductNameChange={jest.fn()}
      onChangeDescription={jest.fn()}
      onBrandChange={jest.fn()}
      onModelChange={jest.fn()}
      onAmountInParentChange={jest.fn()}
      onTypeChange={jest.fn()}
      onChangePhysicalProperties={jest.fn()}
      onChangeCircularityProperties={jest.fn()}
      onVideoChange={jest.fn()}
      onProductDelete={jest.fn()}
      onGoLivePress={jest.fn()}
      {...overrides}
    />,
    { withDialog: true, withAuth: true },
  );
}

describe('ProductPageContent — editing-someone-else notice', () => {
  it('shows the notice when a superuser edits a product they do not own', async () => {
    await renderContent({ editMode: true, editingOthersProduct: true });
    expect(await screen.findByTestId('editing-others-product-notice')).toBeOnTheScreen();
    expect(screen.getByText("You are editing someone else's product.")).toBeOnTheScreen();
  });

  it('hides the notice for the product owner', async () => {
    await renderContent({ editMode: true, editingOthersProduct: false });
    expect(screen.queryByTestId('editing-others-product-notice')).toBeNull();
  });

  it('hides the notice outside edit mode', async () => {
    await renderContent({ editMode: false, editingOthersProduct: false });
    expect(screen.queryByTestId('editing-others-product-notice')).toBeNull();
  });
});
