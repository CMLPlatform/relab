import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { Badge } from '@/components/base/ui/badge';
import { Icon } from '@/components/base/ui/icon';
import { Text } from '@/components/base/ui/text';
import { componentQueryOptions } from '@/features/products/queries';
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
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    ...componentQueryOptions(component.id),
    enabled: expanded && component.components === undefined && typeof component.id === 'number',
  });
  const children = component.components ?? query.data?.components;
  const childCount = children?.length ?? 0;
  // Chevron when children are known to exist, or unknown (undefined = not loaded).
  const canExpand = !nested && (children === undefined || childCount > 0);

  const navigate = () => {
    if (typeof component.id !== 'number') return;
    router.push({ pathname: '/components/[id]', params: { id: component.id.toString() } });
  };

  let expandedBody: ReactNode = null;
  if (expanded && canExpand) {
    if (children) {
      expandedBody = children.map((child) => (
        <ComponentRow key={child.id} component={child} enabled={enabled} nested={true} />
      ));
    } else if (query.isError) {
      expandedBody = (
        <Pressable
          accessibilityRole="button"
          onPress={() => void query.refetch()}
          className="min-h-11 justify-center"
        >
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
              style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: 8 }}
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
              {component.name || 'Unnamed component'}
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
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} components of ${component.name}`}
            onPress={() => setExpanded((current) => !current)}
            className="h-11 w-11 items-center justify-center"
          >
            <Icon as={expanded ? ChevronDown : ChevronRight} size={20} className="opacity-70" />
          </Pressable>
        ) : null}
      </View>
      {expandedBody ? <View className="pl-6">{expandedBody}</View> : null}
    </View>
  );
}
