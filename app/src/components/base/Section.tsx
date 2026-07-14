import { type ReactNode, useContext, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { SectionNavContext } from './SectionNavContext';

export type { SectionKey } from './SectionNavContext';

import type { SectionKey } from './SectionNavContext';

type SectionProps = {
  title: string;
  sectionKey: SectionKey;
  isEmpty?: boolean;
  editMode?: boolean;
  addLabel?: string;
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
  children,
}: SectionProps) {
  const nav = useContext(SectionNavContext);
  const [expandedWhileEmpty, setExpandedWhileEmpty] = useState(false);

  if (isEmpty && !editMode) return null;

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
          <AppText variant="title" className="mb-2">
            {title}
          </AppText>
          {children}
        </>
      )}
    </View>
  );
}
