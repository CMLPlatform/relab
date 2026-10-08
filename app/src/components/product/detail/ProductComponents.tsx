import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { DisclosureRow } from '@/components/base/DisclosureRow';
import { useDialog } from '@/components/base/dialogContext';
import { FADE_ENTER, FADE_EXIT, ROW_MOVE } from '@/components/base/motion';
import { totalComponentWeight } from '@/features/products/componentWeight';
import { componentTreeQueryOptions, useSaveProductMutation } from '@/features/products/queries';
import { newProduct } from '@/services/api/products';
import { createRequestId } from '@/services/api/request';
import { entityLabel, type Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';
import { ComponentRow } from './ComponentRow';

interface Props {
  product: Product;
  editMode: boolean;
  canEdit: boolean;
}

const VISIBLE_WHEN_COLLAPSED = 5;
/** Lists up to this many rows in full; beyond it, the first five plus a disclosure. */
const COLLAPSE_ABOVE = 8;

export default function ProductComponents({ product, editMode, canEdit }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const components = product.components ?? [];
  const label = entityLabel(product);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);
  const dialog = useDialog();
  const saveMutation = useSaveProductMutation();

  // Copies the spec fields only; media and children stay with the original.
  const duplicate = (component: Product) => {
    if (typeof product.id !== 'number') return;
    saveMutation.mutate(
      {
        product: {
          ...newProduct({
            parentID: product.id,
            parentRole: product.role,
            name: component.name,
            brand: component.brand,
            model: component.model,
          }),
          description: component.description,
          productTypeID: component.productTypeID,
          productTypeName: component.productTypeName,
          physicalProperties: component.physicalProperties,
          circularityProperties: component.circularityProperties,
          amountInParent: component.amountInParent,
        },
        originalImages: [],
        originalVideos: [],
        idempotencyKey: createRequestId(),
      },
      {
        onError: (err) =>
          dialog.alert({
            title: 'Duplicate failed',
            message: getErrorMessage(err, 'Could not duplicate. Please try again.'),
            buttons: [{ text: 'OK' }],
          }),
      },
    );
  };

  // Leaving edit mode is itself a navigation (`router.setParams({ edit:
  // undefined })`), and a push in the same frame gets dropped by the router.
  // Deferring a frame sequences them. Flaked ~2 in 8 under parallel E2E load.
  // TODO: stop encoding edit mode in the URL so exiting it is not a navigation.
  const newComponent = () => {
    if (typeof product.id !== 'number') return;
    const id = product.id.toString();
    const pathname =
      product.role === 'component'
        ? '/components/[id]/components/new'
        : '/products/[id]/components/new';
    requestAnimationFrame(() => router.push({ pathname, params: { id } }));
  };

  // Collapse only when it hides more than a couple of rows: a "Show 1 more"
  // link costs a tap to save one row.
  const collapsible = components.length > COLLAPSE_ABOVE;
  const visibleComponents =
    expanded || !collapsible ? components : components.slice(0, VISIBLE_WHEN_COLLAPSED);
  const hiddenCount = Math.max(0, components.length - visibleComponents.length);

  return (
    <View>
      {components.length === 0 && (
        <AppText style={{ opacity: 0.7, marginBottom: 8 }}>
          This {label} has no subcomponents.
        </AppText>
      )}
      {typeof product.id === 'number' && components.length > 0 ? (
        <WeightTotal productId={product.id} />
      ) : null}
      <LayoutAnimationConfig skipEntering skipExiting>
        {visibleComponents.map((component) => (
          // Always the same wrapper, so a row keeps its identity (and its expanded
          // state) when "Show more" changes which rows are past the fold. Rows
          // added or revealed fade in; the rest slide to make room.
          <Animated.View
            key={component.id}
            entering={FADE_ENTER}
            exiting={FADE_EXIT}
            layout={ROW_MOVE}
          >
            <ComponentRow
              component={component}
              enabled={!editMode}
              onDuplicate={editMode && canEdit ? () => duplicate(component) : undefined}
            />
          </Animated.View>
        ))}
      </LayoutAnimationConfig>
      {collapsible && (
        <DisclosureRow
          label={
            expanded
              ? 'Show fewer components'
              : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'component' : 'components'}`
          }
          expanded={expanded}
          onPress={toggleExpanded}
        />
      )}
      {/* Shown in edit mode too. Creation routes to `?edit=1`, so hiding this
          removed the teardown's actual next step at the exact moment the user
          has the product open in front of them, and the record is already
          persisted by then, which is why the gate is `id`, not `editMode`. */}
      {typeof product.id === 'number' && canEdit && (
        <AppButton variant="primary" onPress={newComponent} className="mx-4 my-2">
          Add component
        </AppButton>
      )}
    </View>
  );
}

const grams = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** One line with the components' total weight, or why it is partial or missing. Silent while loading or on a failed fetch. */
function WeightTotal({ productId }: { productId: number }) {
  const { data: tree } = useQuery(componentTreeQueryOptions(productId));
  if (tree === undefined) return null;
  let text: string;
  if (tree === null) {
    text = 'Too many components to total their weight.';
  } else {
    const { grams: total, missing } = totalComponentWeight(tree);
    const without = `${missing} ${missing === 1 ? 'component has' : 'components have'} no weight`;
    if (missing === 0) text = `Components weigh ${grams.format(total)} g in total.`;
    else if (total === 0) text = `No total weight yet: ${without}.`;
    else text = `Components weigh at least ${grams.format(total)} g: ${without}.`;
  }
  return (
    <AppText variant="label" className="mb-2 text-muted-foreground">
      {text}
    </AppText>
  );
}
