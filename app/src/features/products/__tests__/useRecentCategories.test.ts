import { act, renderHook } from '@testing-library/react-native';
import { useRecentCategories } from '@/features/products/useRecentCategories';
import { clearPersistedUserData } from '@/services/storage';

const cat = (id: number) =>
  ({
    id,
    description: `Cat ${id}`,
    directChildren: [],
    allChildren: [id * 100, id * 101],
  }) as never;

test('records most-recent-first, dedupes, caps at 5', () => {
  const { result } = renderHook(() => useRecentCategories());
  act(() => {
    for (const id of [1, 2, 3, 4, 5, 6, 2]) result.current.recordRecent(cat(id));
  });
  expect(result.current.recents.map((c) => c.id)).toEqual([2, 6, 5, 4, 3]);
});

test('strips allChildren before persisting — only read by live cpvClass filtering, never by recents cards', () => {
  const { result } = renderHook(() => useRecentCategories());
  act(() => {
    result.current.recordRecent(cat(1));
  });
  expect(result.current.recents[0]).toMatchObject({ id: 1, allChildren: [] });
});

// Sign-out used to drop only the AsyncStorage key, leaving the picks in
// memory: on a shared device the next user saw them and the next write
// persisted them straight back.
test('sign-out empties the live store, not just its persisted copy', async () => {
  const { result } = renderHook(() => useRecentCategories());
  act(() => {
    result.current.recordRecent(cat(9));
  });
  expect(result.current.recents.length).toBeGreaterThan(0);

  await act(async () => {
    await clearPersistedUserData();
  });

  expect(result.current.recents).toEqual([]);
});
