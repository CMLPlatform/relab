import { act, renderHook } from '@testing-library/react-native';
import type { SectionNavApi } from '@/components/base/SectionNavContext';
import { useAnchoredSectionNav } from '@/hooks/useAnchoredSectionNav';

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

test('registers with the composed offset once both ancestor layouts land', async () => {
  const nav = makeNav();
  const { result } = await renderHook(() => useAnchoredSectionNav(nav));

  await act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  await act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));
  await act(() => result.current.value?.registerSection('physical', 40));

  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 360);
});

test('heals a section that registers before the ancestor offsets are known', async () => {
  const nav = makeNav();
  const { result } = await renderHook(() => useAnchoredSectionNav(nav));

  // Section registers first, with baseOffset still 0.
  await act(() => result.current.value?.registerSection('physical', 40));
  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 40);

  // Ancestor offsets land afterwards — the raw position is re-pushed corrected.
  await act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  await act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));

  expect(nav.registerSection).toHaveBeenLastCalledWith('physical', 360);
});

test('unregistering drops the section from future re-anchoring', async () => {
  const nav = makeNav();
  const { result } = await renderHook(() => useAnchoredSectionNav(nav));

  await act(() => result.current.value?.registerSection('circularity', 10));
  await act(() => result.current.value?.unregisterSection?.('circularity'));
  nav.registerSection.mockClear();

  await act(() => result.current.onPageContainerLayout(layoutEvent(300)));
  await act(() => result.current.onSectionsWrapperLayout(layoutEvent(20)));

  expect(nav.registerSection).not.toHaveBeenCalled();
  expect(nav.unregisterSection).toHaveBeenCalledWith('circularity');
});
