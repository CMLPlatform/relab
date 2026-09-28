import { useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { MIN_TAP_TARGET } from '@/constants';
import { truncateHeaderLabel } from '@/features/products/truncateHeaderLabel';
import type { AncestorCrumb } from '@/features/products/useAncestorTrail';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import type { AppTheme } from '@/theme/types';

export function AncestorTrailHeader({
  ancestors,
  currentNameSlot,
  theme,
}: {
  ancestors: AncestorCrumb[];
  /** What renders at the tail of the trail: a plain label in view mode, an editable input in edit mode. */
  currentNameSlot: ReactNode;
  theme: AppTheme;
}) {
  // The phone header has ~260px beside the back button; the lg page header row
  // spans the content column, so names there need not be cut to a stub.
  const { isLg } = useBreakpoint();
  const perCrumbLimit = isLg ? 36 : ancestors.length > 1 ? 14 : 20;
  return (
    <View
      style={{ maxWidth: isLg ? 720 : 260, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      {ancestors.map((crumb) => (
        <TrailCrumb
          key={crumb.id}
          crumb={crumb}
          perCrumbLimit={perCrumbLimit}
          maxCrumbWidth={isLg ? 280 : 100}
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
  maxCrumbWidth,
  iconColor,
}: {
  crumb: AncestorCrumb;
  perCrumbLimit: number;
  maxCrumbWidth: number;
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
      {/* The breadcrumb is the app's structural spine and was the one control
          the tap-target sweep missed: 13px text with `hitSlop={6}`, which is
          invisible to the DOM on web, and no role, so assistive tech announced
          it as neither a target nor a control. Padding plus a negative margin
          reaches the 44px floor without pushing the header taller. */}
      <Pressable
        onPress={handlePress}
        hitSlop={6}
        accessibilityRole="link"
        accessibilityLabel={`Go to ${crumb.name}`}
        style={{
          minHeight: MIN_TAP_TARGET,
          justifyContent: 'center',
          paddingVertical: 12,
          marginVertical: -12,
        }}
      >
        <AppText
          variant="caption"
          numberOfLines={1}
          style={{
            maxWidth: maxCrumbWidth,
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
