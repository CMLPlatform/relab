import { act, fireEvent, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { ProductsListContent } from '@/components/product/products-screen/ListContent';
import {
  baseProduct,
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
  it('fades the product list in rather than hard-cutting from the skeletons', () => {
    const { getByTestId, UNSAFE_getByType } = renderList();
    // The skeleton branch renders a different tree entirely, so without this the
    // swap is eight grey cards replaced by eight real ones in a single frame.
    // The fade lives on a flex-1 wrapper, not on Animated.FlatList — reanimated's
    // web layout-animation path crashes on FlatList hosts in the web export
    // (its own source warns "wrap your component with an animated view and
    // apply the layout animation on the wrapper" for exactly this reason).
    expect(getByTestId('products-list-fade').props.entering).toBeDefined();
    expect(UNSAFE_getByType(FlatList)).toBeTruthy();
  });

  // Regression guard for the crash above: `entering`/`layout` must never land
  // directly on the virtualized FlatList itself, only on the wrapper.
  it('never applies a layout animation to the FlatList itself', () => {
    const { UNSAFE_getByType } = renderList();

    const list = UNSAFE_getByType(FlatList);
    expect(list.props.entering).toBeUndefined();
    expect(list.props.layout).toBeUndefined();
  });
});

describe('ProductsListContent pull-to-refresh', () => {
  it('does not spin the pull-to-refresh control for a background refetch', () => {
    // isFetchingNextPage must never drive the pull-to-refresh spinner — only a
    // user-initiated pull (handled below) may.
    const { UNSAFE_getByProps } = renderList({ isFetchingNextPage: true });

    const refreshControl = UNSAFE_getByProps({ refreshing: false });
    expect(refreshControl).toBeTruthy();
  });

  it('spins the pull-to-refresh control only while a user-initiated refresh is in flight', async () => {
    let resolveRefresh: () => void = () => {};
    const onRefresh = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { UNSAFE_getByProps } = renderList({ onRefresh });

    const refreshControl = UNSAFE_getByProps({ refreshing: false });

    await act(async () => {
      fireEvent(refreshControl, 'refresh');
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(UNSAFE_getByProps({ refreshing: true })).toBeTruthy();

    await act(async () => {
      resolveRefresh();
    });
    expect(UNSAFE_getByProps({ refreshing: false })).toBeTruthy();
  });
});

describe('ProductsListContent infinite scroll', () => {
  it('wires onEndReached to fetch the next page when more results exist', async () => {
    const onFetchNextPage = jest.fn();
    const { UNSAFE_getByType } = renderList({ hasNextPage: true, onFetchNextPage });

    const list = UNSAFE_getByType(FlatList);
    expect(list.props.onEndReachedThreshold).toBe(0.5);

    await act(async () => {
      list.props.onEndReached();
    });

    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not fetch past the end when there is no next page', async () => {
    const onFetchNextPage = jest.fn();
    const { UNSAFE_getByType } = renderList({ hasNextPage: false, onFetchNextPage });

    const list = UNSAFE_getByType(FlatList);
    await act(async () => {
      list.props.onEndReached();
    });

    expect(onFetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a footer spinner while fetching the next page, not the Load more button', () => {
    const { getByLabelText, queryByLabelText } = renderList({
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    expect(getByLabelText('Loading more products')).toBeOnTheScreen();
    expect(queryByLabelText('Load more products')).toBeNull();
  });

  it('shows an explicit Load more button when more results exist and nothing is in flight', () => {
    const onFetchNextPage = jest.fn();
    const { getByLabelText, queryByLabelText } = renderList({
      hasNextPage: true,
      onFetchNextPage,
    });

    expect(queryByLabelText('Loading more products')).toBeNull();
    fireEvent.press(getByLabelText('Load more products'));
    expect(onFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('shows neither spinner nor Load more once every page is loaded', () => {
    const { queryByLabelText, getByText } = renderList({
      hasNextPage: false,
      isFetchingNextPage: false,
      products: [baseProduct],
      total: 1,
    });

    expect(queryByLabelText('Load more products')).toBeNull();
    expect(queryByLabelText('Loading more products')).toBeNull();
    expect(getByText('1 of 1 products')).toBeOnTheScreen();
  });

  it('shows the muted product-count caption', () => {
    const { getByText } = renderList({ products: [baseProduct], total: 55, hasNextPage: true });

    expect(getByText('1 of 55 products')).toBeOnTheScreen();
  });
});

// RefreshControl's pull gesture does nothing on react-native-web, so without a
// tappable affordance the web build has no way to refetch short of a reload.
describe('ProductsListContent manual refresh (web)', () => {
  afterEach(() => restorePlatform());

  it('offers a Refresh control on web that runs the same refetch as pull-to-refresh', async () => {
    mockPlatform('web');
    const onRefresh = jest.fn(async () => undefined);
    renderList({ onRefresh });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Refresh products'));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('leaves it out on native, where the pull gesture already works', () => {
    mockPlatform('ios');
    renderList();
    expect(screen.queryByLabelText('Refresh products')).toBeNull();
  });
});
