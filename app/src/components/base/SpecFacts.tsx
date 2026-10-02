import { Platform, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Skeleton } from '@/components/base/Skeleton';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme/appThemeContext';

export type SpecFact = { label: string; value: string };

/**
 * The Spec Row (DESIGN.md, Signature): manila eyebrow labels over mono `data`
 * values, left-aligned under a hairline, wrapping onto more lines when narrow.
 * Read-only facts use it everywhere: the spec-sheet header, the account
 * identity, and view-mode brand and model. Hides itself when empty; `loading`
 * keeps the labels and pulses each value.
 */
export function SpecFacts({ facts, loading = false }: { facts: SpecFact[]; loading?: boolean }) {
  const { colors } = useAppTheme();
  if (facts.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3">
      {facts.map((fact) => (
        // One screen-reader stop per fact on native ("Weight: 1600 g"), not two.
        // Not on web: an aria-label on a role-less div is prohibited ARIA, and the
        // label and value already read in order there.
        <View
          key={fact.label}
          className="shrink"
          accessible={Platform.OS !== 'web'}
          accessibilityLabel={
            Platform.OS === 'web' ? undefined : `${fact.label}: ${loading ? '…' : fact.value}`
          }
        >
          <AppText variant="eyebrow" className="text-manila">
            {fact.label}
          </AppText>
          {loading ? (
            <Skeleton
              testID="spec-fact-skeleton"
              style={[styles.valueSkeleton, { backgroundColor: colors.muted }]}
            />
          ) : (
            <AppText variant="data">{fact.value}</AppText>
          )}
        </View>
      ))}
    </View>
  );
}

// Skeleton wraps Animated.View, which ignores className. Sized to the data
// line height (20) so the real value does not shift layout.
const styles = StyleSheet.create({
  valueSkeleton: {
    width: 28,
    height: 20,
    borderRadius: radius.control,
  },
});
