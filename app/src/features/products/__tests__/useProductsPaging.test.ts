import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProductsPaging } from '@/features/products/screenData';

describe('useProductsPaging', () => {
  // Regression: the mobile infinite-scroll page lived in local state that never
  // reset when the query changed, so after scrolling and then editing a filter
  // the list refired every page (1..N) for the new query. The resetKey change
  // must snap it back to page 1.
  it('resets the mobile page to 1 when the search/filter key changes', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useProductsPaging({ numColumns: 1, page: 1, updateParams: jest.fn(), resetKey }),
      { initialProps: { resetKey: 'all|' } },
    );

    act(() => result.current.setPage(4));
    expect(result.current.effectivePage).toBe(4);

    rerender({ resetKey: 'all|widget' });
    expect(result.current.effectivePage).toBe(1);
  });

  it('does not reset while paging within the same query', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useProductsPaging({ numColumns: 1, page: 1, updateParams: jest.fn(), resetKey }),
      { initialProps: { resetKey: 'all|' } },
    );

    act(() => result.current.setPage(3));
    rerender({ resetKey: 'all|' });
    expect(result.current.effectivePage).toBe(3);
  });
});
