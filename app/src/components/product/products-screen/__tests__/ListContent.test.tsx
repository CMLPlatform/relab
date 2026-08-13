import { act, fireEvent } from '@testing-library/react-native';
import { ProductsListContent } from '@/components/product/products-screen/ListContent';
import { baseProduct, renderWithProviders } from '@/test-utils/index';

function renderList({
  isFetching,
  onRefresh,
}: {
  isFetching: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  return renderWithProviders(
    <ProductsListContent
      numColumns={1}
      productList={[baseProduct]}
      filterMode="all"
      isFetching={isFetching}
      isLoading={false}
      slowLoading={false}
      total={1}
      totalPages={1}
      hasMore={false}
      effectivePage={1}
      searchQuery=""
      isAuthenticated
      onScroll={undefined}
      onRefresh={onRefresh}
      onSetPage={jest.fn()}
    />,
  );
}

describe('ProductsListContent pull-to-refresh', () => {
  it('does not spin the pull-to-refresh control for a background refetch', () => {
    const { UNSAFE_getByProps } = renderList({ isFetching: true, onRefresh: jest.fn() });

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
    const { UNSAFE_getByProps } = renderList({ isFetching: false, onRefresh });

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
