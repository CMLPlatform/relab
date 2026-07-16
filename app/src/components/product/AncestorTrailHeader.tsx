import { useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { truncateHeaderLabel } from '@/features/products/truncateHeaderLabel';
import type { AncestorCrumb } from '@/features/products/useAncestorTrail';
import type { AppTheme } from '@/theme';

export function AncestorTrailHeader({
  ancestors,
  currentNameSlot,
  theme,
}: {
  ancestors: AncestorCrumb[];
  /** What renders at the tail of the trail — a plain label in view mode, an editable input in edit mode. */
  currentNameSlot: ReactNode;
  theme: AppTheme;
}) {
  const perCrumbLimit = ancestors.length > 1 ? 14 : 20;
  return (
    <View style={{ maxWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {ancestors.map((crumb) => (
        <TrailCrumb
          key={crumb.id}
          crumb={crumb}
          perCrumbLimit={perCrumbLimit}
          iconColor={theme.colors.onSurfaceVariant}
        />
      ))}
      {currentNameSlot}
    </View>
  );
}

function TrailCrumb({
  crumb,
  perCrumbLimit,
  iconColor,
}: {
  crumb: AncestorCrumb;
  perCrumbLimit: number;
  iconColor: string;
}) {
  const router = useRouter();
  const handlePress = useCallback(() => {
    router.push({
      pathname: crumb.role === 'component' ? '/components/[id]' : '/products/[id]',
      params: { id: crumb.id.toString() },
    });
  }, [router, crumb.role, crumb.id]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable onPress={handlePress} hitSlop={6}>
        <AppText
          numberOfLines={1}
          style={{
            maxWidth: 100,
            fontSize: 13,
            opacity: 0.7,
            fontWeight: '600',
          }}
        >
          {truncateHeaderLabel(crumb.name, perCrumbLimit)}
        </AppText>
      </Pressable>
      <Icon name="chevron-right" size="sm" color={iconColor} />
    </View>
  );
}
