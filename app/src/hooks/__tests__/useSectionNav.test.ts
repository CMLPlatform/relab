import { act, renderHook } from '@testing-library/react-native';
import { useSectionNav } from '@/hooks/useSectionNav';

test('scrollTo uses registered position minus offset, clamped at 0', async () => {
  const scrollToY = jest.fn();
  const { result } = await renderHook(() => useSectionNav(scrollToY));
  await act(() => {
    result.current.registerSection('overview', 0);
    result.current.registerSection('physical', 400);
  });
  await act(() => result.current.scrollTo('physical'));
  expect(scrollToY).toHaveBeenCalledWith(392);
  await act(() => result.current.scrollTo('overview'));
  expect(scrollToY).toHaveBeenCalledWith(0);
});

test('scroll spy activates the last section above the threshold line', async () => {
  const { result } = await renderHook(() => useSectionNav(jest.fn()));
  await act(() => {
    result.current.registerSection('overview', 0);
    result.current.registerSection('components', 300);
    result.current.registerSection('physical', 700);
  });
  await act(() => result.current.onScrollSpy(0));
  expect(result.current.activeKey).toBe('overview');
  await act(() => result.current.onScrollSpy(320));
  expect(result.current.activeKey).toBe('components');
  await act(() => result.current.onScrollSpy(680));
  expect(result.current.activeKey).toBe('physical');
});

test('scrollTo for an unregistered key is a no-op', async () => {
  const scrollToY = jest.fn();
  const { result } = await renderHook(() => useSectionNav(scrollToY));
  await act(() => result.current.scrollTo('media'));
  expect(scrollToY).not.toHaveBeenCalled();
});
