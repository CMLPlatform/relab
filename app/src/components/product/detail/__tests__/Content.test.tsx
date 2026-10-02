import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { ProductPageContent } from '@/components/product/detail/Content';
import { baseProduct, renderWithProviders } from '@/test-utils/index';

jest.mock('expo-image', () =>
  jest
    .requireActual<typeof import('@/test-utils/native-mocks')>('@/test-utils/native-mocks')
    .mockExpoImage({ prefetch: true, imageBackground: true }),
);

jest.mock('react-native-gesture-handler', () =>
  jest
    .requireActual<typeof import('@/test-utils/native-mocks')>('@/test-utils/native-mocks')
    .mockGestureHandler(),
);

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
      enterEditMode={jest.fn()}
      {...overrides}
    />,
    { withDialog: true, withAuth: true },
  );
}

describe('ProductPageContent — editing-someone-else notice', () => {
  it('shows the notice when a superuser edits a product they do not own', async () => {
    await renderContent({ editMode: true, editingOthersProduct: true });
    expect(await screen.findByTestId('editing-others-product-notice')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "You are moderating someone else's product. You can correct details or remove content.",
      ),
    ).toBeOnTheScreen();
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

describe('ProductPageContent — moderating someone else’s product', () => {
  const othersProduct = {
    ...baseProduct,
    ownedBy: 'someone-else',
    images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
    videos: [{ id: 7, url: 'https://youtu.be/abc', title: 'Teardown', description: '' }],
  };

  it('keeps field editing and deletes but withholds every add control', async () => {
    await renderContent({
      product: othersProduct,
      editMode: true,
      canEdit: false,
      editingOthersProduct: true,
    });

    expect(await screen.findByLabelText('Product name')).toBeOnTheScreen();
    expect(screen.getByLabelText('Delete photo')).toBeOnTheScreen();
    expect(screen.getByTestId('delete-video-0')).toBeOnTheScreen();
    expect(screen.getByText('Delete product')).toBeOnTheScreen();

    expect(screen.queryByLabelText('Add photo from gallery')).toBeNull();
    expect(screen.queryByText('Add video')).toBeNull();
    expect(screen.queryByText('Add component')).toBeNull();
  });

  it('shows the owner the add controls the moderator does not get', async () => {
    await renderContent({ product: { ...othersProduct, ownedBy: 'me' }, editMode: true });

    expect(await screen.findByLabelText('Add photo from gallery')).toBeOnTheScreen();
    expect(screen.getByText('Add video')).toBeOnTheScreen();
    expect(screen.getByText('Add component')).toBeOnTheScreen();
  });
});

describe('ProductPageContent — missing-data checklist (#325)', () => {
  const completeProduct = {
    ...baseProduct,
    productTypeID: 1,
    productTypeName: 'Furniture',
    brand: 'Acme',
    description: 'A stand.',
    images: [{ id: '1', url: 'file://photo1.jpg', description: '' }],
  };

  it('shows the checklist to the owner when data is missing', async () => {
    await renderContent({ product: baseProduct, ownedByMe: true });

    expect(await screen.findByTestId('missing-fields-notice')).toBeOnTheScreen();
    expect(screen.getByLabelText('Jump to product type')).toBeOnTheScreen();
    expect(screen.getByLabelText('Jump to a photo')).toBeOnTheScreen();
  });

  it('hides the checklist from a non-owner (including a moderating superuser)', async () => {
    await renderContent({ product: baseProduct, ownedByMe: false });

    expect(screen.queryByTestId('missing-fields-notice')).toBeNull();
  });

  it('hides the checklist for the owner when the product is complete', async () => {
    await renderContent({ product: completeProduct, ownedByMe: true });

    expect(screen.queryByTestId('missing-fields-notice')).toBeNull();
  });

  // TDD for #18: in view mode, an empty Overview is collapsed out of the page
  // entirely, so a link into it has nothing to scroll to until edit mode shows
  // the section. Properties always renders in view mode, so its own link still
  // just scrolls.
  it('enters edit mode from a missing-field link whose section is collapsed in view mode', async () => {
    const enterEditMode = jest.fn();
    // Brand, product type and description all missing -> Overview has nothing
    // to show and view mode collapses it (content-sections.tsx isOverviewEmpty).
    const emptyOverviewProduct = {
      ...baseProduct,
      brand: '',
      model: '',
      description: '',
      productTypeID: undefined,
      productTypeName: undefined,
    };
    await renderContent({
      product: emptyOverviewProduct,
      editMode: false,
      ownedByMe: true,
      enterEditMode,
    });

    const link = await screen.findByLabelText('Jump to product type');
    fireEvent.press(link);

    expect(enterEditMode).toHaveBeenCalledTimes(1);
  });
});
