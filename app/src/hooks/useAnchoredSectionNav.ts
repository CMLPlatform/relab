import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import type { SectionKey, SectionNavApi } from '@/components/base/SectionNavContext';

/**
 * Section.tsx registers each section's `onLayout` y, which is relative to
 * its immediate parent (the `gap`-wrapped View in Content.tsx) — not to the
 * ScrollView's content, which is what scrollTo/scroll-spy actually use.
 * That View is nested one level inside the constrained PageContainer, which
 * IS a direct child of the scroll content, so the correct offset is the sum
 * of two onLayout readings (PageContainer's y + the wrapper's y), not one.
 *
 * Ordering of onLayout across nested views isn't guaranteed, so a Section
 * can register before both ancestor readings land. Raw (unscrolled) y values
 * are kept per key and re-pushed to the real nav whenever the composed base
 * offset changes, so registrations are always eventually correct regardless
 * of firing order.
 */
export function useAnchoredSectionNav(nav: SectionNavApi | null): {
  value: SectionNavApi | null;
  onPageContainerLayout: (event: LayoutChangeEvent) => void;
  onSectionsWrapperLayout: (event: LayoutChangeEvent) => void;
} {
  const rawPositionsRef = useRef(new Map<SectionKey, number>());
  const pageContainerYRef = useRef(0);
  const sectionsWrapperYRef = useRef(0);
  const [baseOffset, setBaseOffset] = useState(0);

  const recomputeBaseOffset = useCallback(() => {
    const total = pageContainerYRef.current + sectionsWrapperYRef.current;
    setBaseOffset((current) => (current === total ? current : total));
  }, []);

  const onPageContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      pageContainerYRef.current = event.nativeEvent.layout.y;
      recomputeBaseOffset();
    },
    [recomputeBaseOffset],
  );

  const onSectionsWrapperLayout = useCallback(
    (event: LayoutChangeEvent) => {
      sectionsWrapperYRef.current = event.nativeEvent.layout.y;
      recomputeBaseOffset();
    },
    [recomputeBaseOffset],
  );

  const registerSection = useCallback(
    (key: SectionKey, y: number) => {
      rawPositionsRef.current.set(key, y);
      nav?.registerSection(key, baseOffset + y);
    },
    [nav, baseOffset],
  );

  const unregisterSection = useCallback(
    (key: SectionKey) => {
      rawPositionsRef.current.delete(key);
      nav?.unregisterSection?.(key);
    },
    [nav],
  );

  // Re-anchor every already-known section once the composed offset settles
  // (or changes, e.g. on resize) — heals any section that registered early.
  useEffect(() => {
    for (const [key, y] of rawPositionsRef.current) {
      nav?.registerSection(key, baseOffset + y);
    }
  }, [baseOffset, nav]);

  const value = useMemo<SectionNavApi | null>(
    () => (nav ? { ...nav, registerSection, unregisterSection } : null),
    [nav, registerSection, unregisterSection],
  );

  return { value, onPageContainerLayout, onSectionsWrapperLayout };
}
