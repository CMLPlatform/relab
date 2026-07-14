import { useCallback, useRef, useState } from 'react';
import type { SectionKey, SectionNavApi } from '@/components/base/SectionNavContext';

const SCROLL_OFFSET = 8;
const ACTIVE_THRESHOLD = 56;

/**
 * Owns the section-position registry for the detail screen's anchored scroll:
 * sections self-report their layout y, chips/outline jump via scrollTo, and
 * onScrollSpy keeps activeKey in sync while the user scrolls.
 */
export function useSectionNav(
  scrollToY: (y: number) => void,
): SectionNavApi & { onScrollSpy: (offsetY: number) => void } {
  const positionsRef = useRef(new Map<SectionKey, number>());
  const [activeKey, setActiveKey] = useState<SectionKey>('overview');

  const registerSection = useCallback((key: SectionKey, y: number) => {
    positionsRef.current.set(key, y);
  }, []);

  const scrollTo = useCallback(
    (key: SectionKey) => {
      const y = positionsRef.current.get(key);
      if (y === undefined) return;
      scrollToY(Math.max(0, y - SCROLL_OFFSET));
    },
    [scrollToY],
  );

  const onScrollSpy = useCallback((offsetY: number) => {
    let best: { key: SectionKey; y: number } | undefined;
    for (const [key, y] of positionsRef.current) {
      if (y <= offsetY + ACTIVE_THRESHOLD && (!best || y > best.y)) {
        best = { key, y };
      }
    }
    if (best) setActiveKey((current) => (current === best.key ? current : best.key));
  }, []);

  return { registerSection, scrollTo, onScrollSpy, activeKey };
}
