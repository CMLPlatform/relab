import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SectionNav } from './SectionNav';
import type { SectionKey } from './SectionNavContext';

/**
 * Shared document-nav shell for anchored-scroll screens (product detail,
 * account): phone gets a chips row pinned above the scroll, ≥lg web gets a
 * fixed outline column beside it. Extracted from ProductDetailScreen so the
 * account screen (phase 3) reuses the exact same layout instead of a second
 * copy — keep any change here in sync across both screens' tests.
 */
export function SectionNavLayout({
  isLg,
  navSections,
  activeKey,
  onPressSection,
  children,
}: {
  isLg: boolean;
  navSections: { key: SectionKey; label: string }[];
  activeKey: SectionKey;
  onPressSection: (key: SectionKey) => void;
  children: ReactNode;
}) {
  if (isLg) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View testID="section-nav-outline" style={{ width: 200, padding: 16 }}>
          <SectionNav
            sections={navSections}
            activeKey={activeKey}
            onPress={onPressSection}
            orientation="outline"
          />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View testID="section-nav-chips">
        <SectionNav
          sections={navSections}
          activeKey={activeKey}
          onPress={onPressSection}
          orientation="chips"
        />
      </View>
      {children}
    </View>
  );
}
