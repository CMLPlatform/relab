import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { DisclosureChevron } from '@/components/base/DisclosureChevron';
import { ErrorState } from '@/components/base/ErrorState';
import { Icon } from '@/components/base/Icon';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import { Badge } from '@/components/base/ui/badge';
import { IMAGE_FADE_MS, radius, WEB_FOCUS_RING } from '@/constants';
import { componentQueryOptions } from '@/features/product-entity/queries';
import { useAppTheme } from '@/theme/appThemeContext';
import { palette } from '@/theme/palette.generated';
import type { Product } from '@/types/Product';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';

interface Props {
  component: Product;
  enabled: boolean;
  /** Internal: nested child rows never expand further (the component list shows one level deep). */
  nested?: boolean;
  /** Edit mode only: copy this row into a new sibling component. */
  onDuplicate?: () => void;
}

const THUMBNAIL_SIZE = 44;

/** Component row. Children absent from the parent payload are fetched on first expand. */
export function ComponentRow({ component, enabled, nested = false, onDuplicate }: Props) {
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
  // A fetch we triggered resolved to zero children, distinct from a payload
  // that already told us the count was zero (which never shows a chevron).
  const fetchedEmpty = wasUnknown && query.isSuccess && childCount === 0;
  // Chevron when children exist, are not loaded yet, or the row is
  // expanded-but-empty (so it can still be collapsed).
  const canExpand = !nested && (children === undefined || childCount > 0 || fetchedEmpty);

  const navigate = useCallback(() => {
    if (typeof component.id !== 'number') return;
    router.push({ pathname: '/components/[id]', params: { id: component.id.toString() } });
  }, [component.id, router]);
  const retry = useCallback(() => void query.refetch(), [query]);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

  const expandedBody =
    expanded && canExpand ? (
      <ExpandedBody
        items={children}
        enabled={enabled}
        fetchedEmpty={fetchedEmpty}
        isError={query.isError}
        error={query.error}
        onRetry={retry}
      />
    ) : null;

  return (
    <View>
      <View className="flex-row items-center">
        <Pressable
          accessibilityRole="button"
          disabled={!enabled}
          onPress={navigate}
          className={cn(
            'min-h-11 flex-1 flex-row items-center gap-3 rounded-md py-1.5',
            enabled && PRESS_TINT,
            WEB_FOCUS_RING,
          )}
        >
          {component.thumbnailUrl ? (
            // Decorative: the row button carries the name. expo-image drops an
            // empty alt, so hide the subtree (same treatment as StaticBackground).
            <View aria-hidden>
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: component.thumbnailUrl }}
                style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: radius.card }}
                contentFit="cover"
                transition={IMAGE_FADE_MS}
                cachePolicy="memory-disk"
                testID="component-thumbnail"
              />
            </View>
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
              <AppText variant="label" className="text-muted-foreground">
                {component.productTypeName}
              </AppText>
            ) : null}
          </View>
          {childCount > 0 ? (
            <Badge variant="secondary">
              <AppText variant="data" className="text-secondary-foreground">
                {childCount}
              </AppText>
            </Badge>
          ) : null}
        </Pressable>
        {onDuplicate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Duplicate ${displayName}`}
            onPress={onDuplicate}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-md',
              PRESS_TINT,
              WEB_FOCUS_RING,
            )}
          >
            <Icon name="copy" size={20} color={palette[theme.scheme].mutedForeground} />
          </Pressable>
        ) : null}
        {canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} components of ${displayName}`}
            // aria-*, not accessibilityState: only the aria props reach the DOM on web.
            aria-expanded={expanded}
            onPress={toggleExpanded}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-md',
              PRESS_TINT,
              WEB_FOCUS_RING,
            )}
          >
            <DisclosureChevron
              expanded={expanded}
              size={20}
              color={palette[theme.scheme].mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {expandedBody ? <ChildrenReveal>{expandedBody}</ChildrenReveal> : null}
    </View>
  );
}

/** Drops in from the row it belongs to, so the new rows read as its children. */
function ChildrenReveal({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
    >
      <View className="pl-6">{children}</View>
    </Animated.View>
  );
}

function ExpandedNote({ text }: { text: string }) {
  return (
    <View className="min-h-11 justify-center">
      <AppText variant="label" className="text-muted-foreground">
        {text}
      </AppText>
    </View>
  );
}

/** The rows under an expanded component: its children, or why there are none yet. */
function ExpandedBody({
  items,
  enabled,
  fetchedEmpty,
  isError,
  error,
  onRetry,
}: {
  items: Product['components'];
  enabled: boolean;
  fetchedEmpty: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}): ReactNode {
  if (items && items.length > 0) {
    return items.map((child) => (
      <ComponentRow key={child.id} component={child} enabled={enabled} nested={true} />
    ));
  }
  if (fetchedEmpty) return <ExpandedNote text="No subcomponents" />;
  if (isError) {
    return (
      <ErrorState
        compact
        title="Couldn't load components"
        message={getErrorMessage(error, 'Check your connection and try again.')}
        onRetry={onRetry}
        actionAccessibilityLabel="Retry loading components"
      />
    );
  }
  return <ExpandedNote text="Loading components…" />;
}
