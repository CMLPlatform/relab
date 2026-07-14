import { createContext } from 'react';

export type SectionKey = 'overview' | 'components' | 'physical' | 'circularity' | 'media' | 'meta';

export type SectionNavApi = {
  registerSection: (key: SectionKey, y: number) => void;
  scrollTo: (key: SectionKey) => void;
  activeKey: SectionKey;
};

export const SectionNavContext = createContext<SectionNavApi | null>(null);
