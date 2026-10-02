import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { FocusEvent, LayoutChangeEvent } from 'react-native';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';
import { PRESS_TINT } from './pressFeedback';
import type { SectionKey } from './SectionNavContext';

// Browsers do not reliably scroll a partly visible focused chip into the row's
// view (Chromium leaves it cut off), so a Tab through the chips does it here.
function scrollFocusedChipIntoView(event: FocusEvent) {
  const chip = event.currentTarget as unknown as HTMLElement;
  chip.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

const CHIP_SCROLL_INSET = 24;

function SectionNavItem({
  section,
  active,
  compact,
  onPress,
  onItemLayout,
}: {
  section: { key: SectionKey; label: string };
  active: boolean;
  /** The phone chip row: caption size so four chips fit a 390pt screen. */
  compact: boolean;
  onPress: (key: SectionKey) => void;
  onItemLayout?: (key: SectionKey, x: number) => void;
}) {
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => onItemLayout?.(section.key, event.nativeEvent.layout.x),
    [onItemLayout, section.key],
  );
  const handlePress = useCallback(() => onPress(section.key), [onPress, section.key]);
  return (
    <Pressable
      onLayout={onLayout}
      onPress={handlePress}
      onFocus={Platform.OS === 'web' ? scrollFocusedChipIntoView : undefined}
      accessibilityRole="button"
      accessibilityLabel={section.label}
      // "location", not "page": these scroll to a section of this page. aria-current
      // reaches the DOM on web but RN has no native mapping for it; accessibilityState
      // (ignored on web) carries the cue to VoiceOver/TalkBack.
      aria-current={active ? 'location' : undefined}
      accessibilityState={{ selected: active }}
      className={cn(
        // px-2 keeps four chips on a 390pt phone; more scroll sideways (see SectionNav).
        'min-h-11 justify-center rounded-md px-2 py-2',
        active ? 'bg-primary/12' : 'opacity-70',
        PRESS_TINT,
        Platform.select({
          // scroll-mx-3: a chip scrolled into view keeps its focus ring clear of the edge.
          web: cn('cursor-pointer outline-none scroll-mx-3', WEB_FOCUS_RING),
        }),
      )}
    >
      {/* Plain words, so untracked type: body in the outline, caption in the chip row. */}
      <AppText
        variant={compact ? 'caption' : 'body'}
        selectable={false}
        className={cn('font-medium', active && 'text-primary')}
      >
        {section.label}
      </AppText>
    </Pressable>
  );
}

/** Section jump-nav: horizontal chips on phone, vertical outline on wide web. */
function SectionNav({
  sections,
  activeKey,
  onPress,
  orientation,
}: {
  sections: { key: SectionKey; label: string }[];
  activeKey: SectionKey;
  onPress: (key: SectionKey) => void;
  orientation: 'chips' | 'outline';
}) {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const chipX = useRef(new Map<SectionKey, number>());
  const handleItemLayout = useCallback((key: SectionKey, x: number) => {
    chipX.current.set(key, x);
  }, []);
  // Keep the active chip in view as the reader scrolls the page, on every platform.
  useEffect(() => {
    const x = chipX.current.get(activeKey);
    if (x !== undefined)
      scrollRef.current?.scrollTo({
        x: Math.max(0, x - CHIP_SCROLL_INSET),
        animated: !reduceMotion,
      });
  }, [activeKey, reduceMotion]);

  const items = sections.map((section) => (
    <SectionNavItem
      key={section.key}
      section={section}
      active={section.key === activeKey}
      compact={orientation === 'chips'}
      onPress={onPress}
      onItemLayout={handleItemLayout}
    />
  ));

  if (orientation === 'outline') {
    return <View className="gap-1">{items}</View>;
  }
  // The row scrolls sideways when the chips outgrow the screen (lab accounts get a
  // fifth). The scrollbar stays visible so the overflow is never hidden, and
  // focusing an off-screen chip scrolls it into view.
  return (
    <ScrollView ref={scrollRef} horizontal className="flex-grow-0">
      <View className="flex-row gap-1 px-3 py-1">{items}</View>
    </ScrollView>
  );
}

/**
 * Document-nav shell for anchored-scroll screens (product detail, account):
 * a chips row on phone, a fixed outline column on >=lg web.
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
