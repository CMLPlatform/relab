import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { RECENT_CATEGORIES_STORAGE_KEY, registerSignOutReset } from '@/services/storage';
import type { CPVCategory } from '@/types/CPVCategory';

const MAX_RECENTS = 5;

type RecentCategoriesState = {
  recents: CPVCategory[];
  recordRecent: (category: CPVCategory) => void;
};

/** Last few CPV categories picked, most-recent-first, deduped by id, persisted across sessions. */
export const useRecentCategories = create<RecentCategoriesState>()(
  persist(
    (set) => ({
      recents: [],
      recordRecent: (category) =>
        set((state) => ({
          // allChildren is never read from a persisted recent; strip it.
          recents: [
            { ...category, allChildren: [] },
            ...state.recents.filter((c) => c.id !== category.id),
          ].slice(0, MAX_RECENTS),
        })),
    }),
    { name: RECENT_CATEGORIES_STORAGE_KEY, storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// Sign-out wipe (see services/storage.ts).
registerSignOutReset(() => {
  useRecentCategories.setState({ recents: [] });
  void useRecentCategories.persist.clearStorage();
});
