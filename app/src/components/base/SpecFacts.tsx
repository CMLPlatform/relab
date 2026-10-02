import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { Skeleton } from '@/components/base/Skeleton';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme/appThemeContext';

const VALUE_ENTER = FadeIn.duration(200).reduceMotion(ReduceMotion.System);

/** `loading` keeps the label and pulses the value until it resolves. */
export type SpecFact = { label: string; value: string; loading?: boolean };

/**
 * The Spec Row (DESIGN.md, Signature): manila eyebrow labels over mono `data`
 * values, left-aligned under a hairline, wrapping onto more lines when narrow.
 * Every read-only set of facts uses it: the product spec-sheet header, the
 * view-mode Overview (brand, model, amount, type), the account's record counts
 * and a public profile's. Hides itself when empty.
 */
export function SpecFacts({ facts }: { facts: SpecFact[] }) {
  const { colors } = useAppTheme();
  if (facts.length === 0) return null;
  return (
    // skipEntering: values already known on mount are just there; only a value
    // that replaces its skeleton fades in.
    <LayoutAnimationConfig skipEntering>
      <View className="flex-row flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3">
        {facts.map(({ label, value, loading }) => (
          // One screen-reader stop per fact on native ("Weight: 1600 g"), not two.
          // Not on web: an aria-label on a role-less div is prohibited ARIA, and the
          // label and value already read in order there.
          <View
            key={label}
            className="shrink"
            accessible={Platform.OS !== 'web'}
            accessibilityLabel={
              Platform.OS === 'web' ? undefined : `${label}: ${loading ? '…' : value}`
            }
          >
            <AppText variant="eyebrow" className="text-manila">
              {label}
            </AppText>
            {loading ? (
              <Skeleton
                testID="spec-fact-skeleton"
                style={[styles.valueSkeleton, { backgroundColor: colors.muted }]}
              />
            ) : (
              <Animated.View entering={VALUE_ENTER}>
                <AppText variant="data">{value}</AppText>
              </Animated.View>
            )}
          </View>
        ))}
      </View>
    </LayoutAnimationConfig>
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
