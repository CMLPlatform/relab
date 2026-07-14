import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
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

  if (!isVisible) return null;

  const showAddRow = isEmpty && editMode && !expandedWhileEmpty;

  return (
    <View
      onLayout={(event) => nav?.registerSection(sectionKey, event.nativeEvent.layout.y)}
      className="rounded-lg bg-card border border-border px-4 py-3"
    >
      {showAddRow ? (
        <AppButton variant="ghost" onPress={() => setExpandedWhileEmpty(true)}>
          {addLabel ?? `Add ${title.toLowerCase()}`}
        </AppButton>
      ) : (
        <>
          <View className="flex-row items-center gap-1.5 mb-2">
            <AppText variant="title">{title}</AppText>
            {titleSuffix ? (
              <AppText variant="label" className="opacity-70">
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
