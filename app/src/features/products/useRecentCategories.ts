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

/**
 * Last few CPV categories picked in the type picker, most-recent-first and
 * deduped by id, persisted across sessions so a repeat capture session
 * remembers what the researcher was just working with.
 */
export const useRecentCategories = create<RecentCategoriesState>()(
  persist(
    (set) => ({
      recents: [],
      recordRecent: (category) =>
        set((state) => ({
          // allChildren is only read for the live cpvClass while browsing
          // (useCategorySelection's `filtered`), never for a persisted recent
          // (CPVCard only reads name/description) — stripping it keeps each
          // entry small and avoids caching a list that goes stale.
          recents: [
            { ...category, allChildren: [] },
            ...state.recents.filter((c) => c.id !== category.id),
          ].slice(0, MAX_RECENTS),
        })),
    }),
    { name: RECENT_CATEGORIES_STORAGE_KEY, storage: createJSONStorage(() => AsyncStorage) },
  ),
);

// Sign-out wipe (see services/storage.ts): clearing the AsyncStorage key alone
// would leave the previous user's picks in memory, and the next write would
// persist them straight back.
registerSignOutReset(() => {
  useRecentCategories.setState({ recents: [] });
  void useRecentCategories.persist.clearStorage();
});
