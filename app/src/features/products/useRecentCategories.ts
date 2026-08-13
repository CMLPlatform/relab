import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
          recents: [category, ...state.recents.filter((c) => c.id !== category.id)].slice(
            0,
            MAX_RECENTS,
          ),
        })),
    }),
    { name: 'relab-recent-categories', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
