import { act, renderHook } from '@testing-library/react-native';
import { useSectionNav } from '@/features/products/useSectionNav';

test('scrollTo uses registered position minus offset, clamped at 0', () => {
  const scrollToY = jest.fn();
  const { result } = renderHook(() => useSectionNav(scrollToY));
  act(() => {
    result.current.registerSection('overview', 0);
    result.current.registerSection('physical', 400);
  });
  act(() => result.current.scrollTo('physical'));
  expect(scrollToY).toHaveBeenCalledWith(392);
  act(() => result.current.scrollTo('overview'));
  expect(scrollToY).toHaveBeenCalledWith(0);
});

test('scroll spy activates the last section above the threshold line', () => {
  const { result } = renderHook(() => useSectionNav(jest.fn()));
  act(() => {
    result.current.registerSection('overview', 0);
    result.current.registerSection('components', 300);
    result.current.registerSection('physical', 700);
  });
  act(() => result.current.onScrollSpy(0));
  expect(result.current.activeKey).toBe('overview');
  act(() => result.current.onScrollSpy(320));
  expect(result.current.activeKey).toBe('components');
  act(() => result.current.onScrollSpy(680));
  expect(result.current.activeKey).toBe('physical');
});

test('scrollTo for an unregistered key is a no-op', () => {
  const scrollToY = jest.fn();
  const { result } = renderHook(() => useSectionNav(scrollToY));
  act(() => result.current.scrollTo('media'));
  expect(scrollToY).not.toHaveBeenCalled();
});
