import { useCallback } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import type { SectionKey } from './SectionNavContext';

type SectionNavProps = {
  sections: { key: SectionKey; label: string }[];
  activeKey: SectionKey;
  onPress: (key: SectionKey) => void;
  orientation: 'chips' | 'outline';
};

function SectionNavItem({
  section,
  active,
  onPress,
}: {
  section: { key: SectionKey; label: string };
  active: boolean;
  onPress: (key: SectionKey) => void;
}) {
  const handlePress = useCallback(() => onPress(section.key), [onPress, section.key]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={active ? `${section.label}, current section` : section.label}
      className={cn(
        'min-h-11 justify-center rounded-full px-4 py-2',
        active ? 'bg-primary/10' : 'opacity-70',
        Platform.select({
          web: 'cursor-pointer outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring',
        }),
      )}
    >
      <AppText variant="label" className={cn(active && 'text-primary')}>
        {section.label}
      </AppText>
    </Pressable>
  );
}

/** Section jump-nav: horizontal chips on phone, vertical outline on wide web. */
export function SectionNav({ sections, activeKey, onPress, orientation }: SectionNavProps) {
  const items = sections.map((section) => (
    <SectionNavItem
      key={section.key}
      section={section}
      active={section.key === activeKey}
      onPress={onPress}
    />
  ));

  if (orientation === 'outline') {
    return <View className="gap-1">{items}</View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-grow-0">
      <View className="flex-row gap-1 px-3 py-1">{items}</View>
    </ScrollView>
  );
}
