import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { Text } from 'react-native-paper';
import { truncateHeaderLabel } from '@/hooks/products/truncateHeaderLabel';
import type { AncestorCrumb } from '@/hooks/products/useAncestorTrail';

export function AncestorTrailHeader({
  ancestors,
  currentNameSlot,
  theme,
}: {
  ancestors: AncestorCrumb[];
  /** What renders at the tail of the trail — a plain label in view mode, an editable input in edit mode. */
  currentNameSlot: ReactNode;
  theme: MD3Theme;
}) {
  const router = useRouter();
  const perCrumbLimit = ancestors.length > 1 ? 14 : 20;
  return (
    <View style={{ maxWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {ancestors.map((crumb) => (
        <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: crumb.role === 'component' ? '/components/[id]' : '/products/[id]',
                params: { id: crumb.id.toString() },
              })
            }
            hitSlop={6}
          >
            <Text
              numberOfLines={1}
              style={{
                maxWidth: 100,
                fontSize: 13,
                opacity: 0.7,
                fontWeight: '600',
              }}
            >
              {truncateHeaderLabel(crumb.name, perCrumbLimit)}
            </Text>
          </Pressable>
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={theme.colors.onSurfaceVariant}
          />
        </View>
      ))}
      {currentNameSlot}
    </View>
  );
}
