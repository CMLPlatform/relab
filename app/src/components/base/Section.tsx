import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { DisclosureRow } from './DisclosureRow';
import { InfoTooltip } from './InfoTooltip';
import { SectionNavContext } from './SectionNavContext';

export type { SectionKey } from './SectionNavContext';

import type { SectionKey } from './SectionNavContext';

type SectionProps = {
  title: string;
  sectionKey: SectionKey;
  isEmpty?: boolean;
  editMode?: boolean;
  addLabel?: string;
  /** Muted text after the title, e.g. a component count like "(3)". */
  titleSuffix?: string;
  /** Info-tooltip text shown beside the title. */
  tooltip?: string;
  /**
   * Extra classes on the root View. Use this instead of a wrapping View: Section
   * must stay a direct child of the section-list wrapper (useAnchoredSectionNav).
   */
  className?: string;
  children: ReactNode;
};

/** Titled detail-screen section. Empty sections vanish in view mode and shrink to an "Add …" row in edit mode. */
export function Section({
  title,
  sectionKey,
  isEmpty = false,
  editMode = false,
  addLabel,
  titleSuffix,
  tooltip,
  className,
  children,
}: SectionProps) {
  const nav = useContext(SectionNavContext);
  const [expandedWhileEmpty, setExpandedWhileEmpty] = useState(false);
  const isVisible = !(isEmpty && !editMode);

  // A collapsed section must leave the scroll-spy registry. nav goes through a
  // ref: the context value changes on every scroll-spy tick, and depending on
  // it would unregister a visible section with no onLayout to re-register it.
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);
  useEffect(() => {
    if (!isVisible) return;
    return () => navRef.current?.unregisterSection?.(sectionKey);
  }, [isVisible, sectionKey]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => nav?.registerSection(sectionKey, event.nativeEvent.layout.y),
    [nav, sectionKey],
  );
  const handleExpand = useCallback(() => setExpandedWhileEmpty(true), []);

  if (!isVisible) return null;

  const showAddRow = isEmpty && editMode && !expandedWhileEmpty;

  return (
    <View
      onLayout={handleLayout}
      className={cn('rounded-lg bg-card border border-border px-4 py-3', className)}
    >
      {showAddRow ? (
        <DisclosureRow
          label={addLabel ?? `Add ${title.toLowerCase()}`}
          expanded={false}
          onPress={handleExpand}
        />
      ) : (
        <>
          <View className="flex-row items-center gap-1.5 mb-2">
            {/* Section is a card, and the ramp assigns card titles `heading`;
                `title` is for the screen. */}
            <AppText variant="heading">{title}</AppText>
            {titleSuffix ? (
              <AppText variant="label" className="text-muted-foreground">
                {titleSuffix}
              </AppText>
            ) : null}
            {tooltip ? <InfoTooltip title={tooltip} /> : null}
          </View>
          {children}
        </>
      )}
    </View>
  );
}
