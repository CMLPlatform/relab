import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { Badge } from '@/components/base/ui/badge';
import { Text } from '@/components/base/ui/text';
import { radius } from '@/constants';
import { componentQueryOptions } from '@/features/product-entity/queries';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';
import type { Product } from '@/types/Product';

interface Props {
  component: Product;
  enabled: boolean;
  /** Internal: nested child rows never expand further (BOM shows one level deep). */
  nested?: boolean;
}

const THUMBNAIL_SIZE = 44;

/**
 * Bill-of-materials row: thumbnail, name, type, child-count badge, and a
 * one-level expand chevron. Children not present in the parent payload
 * (`components === undefined`) are lazily fetched on first expand.
 */
export function ComponentRow({ component, enabled, nested = false }: Props) {
  const router = useRouter();
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const displayName = component.name || 'Unnamed component';

  const wasUnknown = component.components === undefined;
  const query = useQuery({
    ...componentQueryOptions(component.id),
    enabled: expanded && wasUnknown && typeof component.id === 'number',
  });
  const children = component.components ?? query.data?.components;
  const childCount = children?.length ?? 0;
  // A fetch we triggered resolved to zero children — distinct from a payload
  // that already told us the count was zero (which never shows a chevron).
  const fetchedEmpty = wasUnknown && query.isSuccess && childCount === 0;
  // Chevron when children are known to exist, unknown (undefined = not
  // loaded), or a fetch already found the row expanded-but-empty (so the
  // user can still collapse it instead of the row vanishing mid-interaction).
  const canExpand = !nested && (children === undefined || childCount > 0 || fetchedEmpty);

  const navigate = useCallback(() => {
    if (typeof component.id !== 'number') return;
    router.push({ pathname: '/components/[id]', params: { id: component.id.toString() } });
  }, [component.id, router]);
  const retry = useCallback(() => void query.refetch(), [query]);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

  let expandedBody: ReactNode = null;
  if (expanded && canExpand) {
    if (children && children.length > 0) {
      expandedBody = children.map((child) => (
        <ComponentRow key={child.id} component={child} enabled={enabled} nested={true} />
      ));
    } else if (fetchedEmpty) {
      expandedBody = (
        <View className="min-h-11 justify-center">
          <AppText variant="label" className="opacity-70">
            No subcomponents
          </AppText>
        </View>
      );
    } else if (query.isError) {
      expandedBody = (
        <Pressable accessibilityRole="button" onPress={retry} className="min-h-11 justify-center">
          <AppText variant="label" className="opacity-70">
            Couldn't load components — tap to retry
          </AppText>
        </Pressable>
      );
    } else {
      expandedBody = (
        <View className="min-h-11 justify-center">
          <AppText variant="label" className="opacity-70">
            Loading components…
          </AppText>
        </View>
      );
    }
  }

  return (
    <View>
      <View className="flex-row items-center">
        <Pressable
          accessibilityRole="button"
          disabled={!enabled}
          onPress={navigate}
          className="min-h-11 flex-1 flex-row items-center gap-3 py-1.5"
        >
          {component.thumbnailUrl ? (
            <Image
              source={{ uri: component.thumbnailUrl }}
              style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: radius.card }}
              contentFit="cover"
              testID="component-thumbnail"
            />
          ) : (
            <ImagePlaceholder
              width={THUMBNAIL_SIZE}
              height={THUMBNAIL_SIZE}
              testID="component-thumbnail"
            />
          )}
          <View className="flex-1">
            <AppText variant="body" className="font-medium">
              {displayName}
            </AppText>
            {component.productTypeName ? (
              <AppText variant="label" className="opacity-70">
                {component.productTypeName}
              </AppText>
            ) : null}
          </View>
          {childCount > 0 ? (
            <Badge variant="secondary">
              <Text>{childCount}</Text>
            </Badge>
          ) : null}
        </Pressable>
        {canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} components of ${displayName}`}
            accessibilityState={{ expanded }}
            onPress={toggleExpanded}
            className="h-11 w-11 items-center justify-center"
          >
            <Icon
              name={expanded ? 'chevron-down' : 'chevron-right'}
              size={20}
              color={palette[theme.scheme].mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {expandedBody ? <View className="pl-6">{expandedBody}</View> : null}
    </View>
  );
}
