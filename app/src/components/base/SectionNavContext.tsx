import { createContext } from 'react';

/**
 * A section's stable id within one screen's nav (e.g. 'overview', 'security').
 * Deliberately a plain string: the registry is screen-agnostic, so product and
 * account screens keep their own key vocabularies without widening a shared union.
 */
export type SectionKey = string;

export type SectionNavApi = {
  registerSection: (key: SectionKey, y: number) => void;
  /** Drops a section from the registry — collapsed/unmounted sections can't activate scroll-spy. */
  unregisterSection?: (key: SectionKey) => void;
  scrollTo: (key: SectionKey) => void;
  activeKey: SectionKey;
};

export const SectionNavContext = createContext<SectionNavApi | null>(null);
