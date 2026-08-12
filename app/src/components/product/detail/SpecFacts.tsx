import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';

export type SpecFact = { label: string; value: string };

/** Mono "manila tag" facts row for the spec-sheet header. Hides itself when empty. */
export function SpecFacts({ facts }: { facts: SpecFact[] }) {
  if (facts.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-x-6 gap-y-2">
      {facts.map((fact) => (
        <View key={fact.label}>
          <AppText variant="label" className="uppercase opacity-60">
            {fact.label}
          </AppText>
          <AppText variant="data">{fact.value}</AppText>
        </View>
      ))}
    </View>
  );
}
