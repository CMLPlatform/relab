import { act, fireEvent, screen } from '@testing-library/react-native';
import { ProductsListContent } from '@/components/product/products-screen/ListContent';
import { PRODUCTS_FAB_EDGE_GAP } from '@/components/product/products-screen/shared';
import { MIN_TAP_TARGET } from '@/constants';
import {
  baseProduct,
  getHostByType,
  mockPlatform,
  renderWithProviders,
  restorePlatform,
} from '@/test-utils/index';
import type { Product } from '@/types/Product';

function renderList({
  isFetchingNextPage = false,
  hasNextPage = false,
  onRefresh = jest.fn(),
  onFetchNextPage = jest.fn(),
  products = [baseProduct],
  total = 1,
}: {
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onRefresh?: () => Promise<unknown>;
  onFetchNextPage?: () => void;
  products?: Product[];
  total?: number;
} = {}) {
  return renderWithProviders(
    <ProductsListContent
      numColumns={1}
      products={products}
      filterMode="all"
      isLoading={false}
      isFetchingNextPage={isFetchingNextPage}
      slowLoading={false}
      total={total}
      hasNextPage={hasNextPage}
      searchQuery=""
      isAuthenticated
      onScroll={undefined}
      onRefresh={onRefresh}
      onFetchNextPage={onFetchNextPage}
    />,
  );
}

describe('ProductsListContent skeleton handoff', () => {
  it('fades the product list in rather than hard-cutting from the skeletons', async () => {
    const { getByTestId } = await renderList();
    // The skeleton branch renders a different tree entirely, so without this the
    // swap is eight grey cards replaced by eight real ones in a single frame.
    // The fade lives on a flex-1 wrapper, not on Animated.FlatList; reanimated's
    // web layout-animation path crashes on FlatList hosts in the web export
    // (its own source warns "wrap your component with an animated view and
    // apply the layout animation on the wrapper" for exactly this reason).
    expect(getByTestId('products-list-fade').props.entering).toBeDefined();
    expect(getHostByType('RCTScrollView')).toBeTruthy();
  });

  // Regression guard for the crash above: `entering`/`layout` must never land
  // directly on the virtualized FlatList itself, only on the wrapper.
  it('never applies a layout animation to the FlatList itself', async () => {
    await renderList();

    const list = getHostByType('RCTScrollView');
    expect(list.props.entering).toBeUndefined();
    expect(list.props.layout).toBeUndefined();
  });
});

// RefreshControl's props stay on the element the list holds: the host it renders
// (RCTRefreshControl) carries only children, so there is no handler to fire on.
function refreshControl() {
  const list = getHostByType('RCTScrollView');
  const { refreshControl: control } = list.props as {
    refreshControl: { props: { refreshing: boolean; onRefresh: () => void } };
  };
  return control.props;
}

describe('ProductsListContent pull-to-refresh', () => {
  it('does not spin the pull-to-refresh control for a background refetch', async () => {
    // isFetchingNextPage must never drive the pull-to-refresh spinner; only a
    // user-initiated pull (handled below) may.
    await renderList({ isFetchingNextPage: true });

    expect(refreshControl().refreshing).toBe(false);
  });

  it('spins the pull-to-refresh control only while a user-initiated refresh is in flight', async () => {
    let resolveRefresh: () => void = () => {};
    const onRefresh = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    await renderList({ onRefresh });

    expect(refreshControl().refreshing).toBe(false);

    await act(async () => {
      refreshControl().onRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(refreshControl().refreshing).toBe(true);

    await act(async () => {
      resolveRefresh();
    });
    expect(refreshControl().refreshing).toBe(false);
  });
});

describe('ProductsListContent infinite scroll', () => {
  it('wires onEndReached to fetch the next page when more results exist', async () => {
    const onFetchNextPage = jest.fn();
    await renderList({ hasNextPage: true, onFetchNextPage });

    const list = getHostByType('RCTScrollView');
    expect(list.props.onEndReachedThreshold).toBe(0.5);

    await act(async () => {
      list.props.onEndReached();
    });

    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not fetch past the end when there is no next page', async () => {
    const onFetchNextPage = jest.fn();
    await renderList({ hasNextPage: false, onFetchNextPage });

    const list = getHostByType('RCTScrollView');
    await act(async () => {
      list.props.onEndReached();
    });

    expect(onFetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a footer spinner while fetching the next page, not the Load more button', async () => {
    const { getByLabelText, queryByLabelText } = await renderList({
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    expect(getByLabelText('Loading more products')).toBeOnTheScreen();
    expect(queryByLabelText('Load more products')).toBeNull();
  });

  it('shows an explicit Load more button when more results exist and nothing is in flight', async () => {
    const onFetchNextPage = jest.fn();
    const { getByLabelText, queryByLabelText } = await renderList({
      hasNextPage: true,
      onFetchNextPage,
    });

    expect(queryByLabelText('Loading more products')).toBeNull();
    await fireEvent.press(getByLabelText('Load more products'));
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows neither spinner nor Load more once every page is loaded', async () => {
    const { queryByLabelText, getByText } = await renderList({
      hasNextPage: false,
      isFetchingNextPage: false,
      products: [baseProduct],
      total: 1,
    });

    expect(queryByLabelText('Load more products')).toBeNull();
    expect(queryByLabelText('Loading more products')).toBeNull();
    expect(getByText('1 of 1 products')).toBeOnTheScreen();
  });

  it('shows the muted product-count caption', async () => {
    const { getByText } = await renderList({
      products: [baseProduct],
      total: 55,
      hasNextPage: true,
    });

    expect(getByText('1 of 55 products')).toBeOnTheScreen();
  });
});

describe('ProductsListContent chrome', () => {
  afterEach(() => restorePlatform());

  // Focus refetch (TanStack `refetchOnWindowFocus`) and browser reload cover
  // web; a Refresh button above the list was one more control before a record.
  it('renders no Refresh button on web', async () => {
    mockPlatform('web');
    await renderList();
    expect(screen.queryByLabelText('Refresh products')).toBeNull();
  });

  it('reserves enough footer space to scroll the terminal count clear of the FAB', async () => {
    await renderList();
    const list = getHostByType('RCTScrollView');

    expect(list.props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(
      MIN_TAP_TARGET + PRODUCTS_FAB_EDGE_GAP * 2,
    );
  });
});

describe('ProductsListContent empty state', () => {
  it('shows the Relab wordmark over the teardown photo when the list is empty', async () => {
    await renderList({ products: [], total: 0 });

    expect(screen.getByTestId('products-empty-state')).toBeOnTheScreen();
    // The photo is decorative (aria-hidden), so opt into hidden elements.
    expect(screen.getByTestId('expo-image-bg', { includeHiddenElements: true })).toBeOnTheScreen();
    // Jest maps every image asset to `1`, so assert the wordmark footprint
    // (wide, not the old square "9" mark) rather than the source path.
    const wordmark = screen.getByTestId('expo-image', { includeHiddenElements: true });
    expect(wordmark.props.style.width).toBeGreaterThan(wordmark.props.style.height * 2);
  });

  it('does not mount the teardown photo behind a populated list', async () => {
    await renderList();
    expect(screen.queryByTestId('expo-image-bg', { includeHiddenElements: true })).toBeNull();
  });
});
