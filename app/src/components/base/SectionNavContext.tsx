import { createContext } from 'react';

export type SectionKey = 'overview' | 'components' | 'physical' | 'circularity' | 'media' | 'meta';

export type SectionNavApi = {
  registerSection: (key: SectionKey, y: number) => void;
  /** Drops a section from the registry — collapsed/unmounted sections can't activate scroll-spy. */
  unregisterSection?: (key: SectionKey) => void;
  scrollTo: (key: SectionKey) => void;
  activeKey: SectionKey;
};

export const SectionNavContext = createContext<SectionNavApi | null>(null);
