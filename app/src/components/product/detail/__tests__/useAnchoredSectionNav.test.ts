import { act, renderHook } from '@testing-library/react-native';
import type { SectionNavApi } from '@/components/base/SectionNavContext';
import { useAnchoredSectionNav } from '@/components/product/detail/useAnchoredSectionNav';

function layoutEvent(y: number) {
  return { nativeEvent: { layout: { y, x: 0, width: 0, height: 0 } } } as never;
}

function makeNav(): SectionNavApi & { registerSection: jest.Mock; unregisterSection: jest.Mock } {
  return {
    registerSection: jest.fn(),
    unregisterSection: jest.fn(),
    scrollTo: jest.fn(),
    activeKey: 'overview',
  };
}

test('registers with the composed offset once both ancestor layouts land', () => {
  const nav = makeNav();
  const { result } = renderHook(() => useAnchoredSectionNav(nav));

  act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));
  act(() => result.current.value?.registerSection('physical', 40));

  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 360);
});

test('heals a section that registers before the ancestor offsets are known', () => {
  const nav = makeNav();
  const { result } = renderHook(() => useAnchoredSectionNav(nav));

  // Section registers first, with baseOffset still 0.
  act(() => result.current.value?.registerSection('physical', 40));
  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 40);

  // Ancestor offsets land afterwards — the raw position is re-pushed corrected.
  act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));

  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 360);
});

test('unregistering drops the section from future re-anchoring', () => {
  const nav = makeNav();
  const { result } = renderHook(() => useAnchoredSectionNav(nav));

  act(() => result.current.value?.registerSection('circularity', 10));
  act(() => result.current.value?.unregisterSection?.('circularity'));
  nav.registerSection.mockClear();

  act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));

  expect(nav.registerSection).not.toHaveBeenCalled();
  expect(nav.unregisterSection).toHaveBeenCalledWith('circularity');
});
