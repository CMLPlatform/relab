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
   * Extra classes merged onto the section's root View. Section must stay a
   * direct child of its screen's shared section-list wrapper — see
   * useAnchoredSectionNav's base-offset math — so per-section styling (e.g.
   * the account screen's danger-zone divider) goes here instead of an extra
   * wrapping View, which would zero out that section's registered anchor.
   */
  className?: string;
  children: ReactNode;
};

/**
 * Titled detail-screen section. Empty sections vanish in view mode and shrink
 * to a single "Add …" row in edit mode, so sparse records stay short without
 * hiding anything on rich ones (spec Part 1, "Empty sections").
 */
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

  // A section that collapses away (empty + view mode) must also drop out of
  // the scroll-spy/chip registry, or a chip tap or scroll-spy pass can still
  // land on the stale position of a section that isn't actually rendered.
  // nav goes through a ref so the cleanup runs only on actual hide/unmount:
  // the context value changes identity on every scroll-spy tick (activeKey),
  // and depending on it directly would unregister a section that stays
  // visible — with no onLayout re-fire to ever re-register it.
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
