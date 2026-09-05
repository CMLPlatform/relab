import { useCallback } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { DocsLink } from '@/components/base/DocsLink';
import { Separator } from '@/components/base/ui/separator';
import LocalizedFloatInput from '@/components/product/LocalizedFloatInput';
import Cube from '@/components/product/SVGCube';
import { DATA_COLLECTION_DOCS_PATH } from '@/config';
import { productSchema } from '@/services/api/validation/productSchema';
import type { PhysicalProperties, Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangePhysicalProperties?: (newProperties: PhysicalProperties) => void;
}

const unitMap = {
  weight: 'g',
  height: 'cm',
  width: 'cm',
  depth: 'cm',
};

const nameMap = {
  weight: 'Weight',
  height: 'Height',
  width: 'Width',
  depth: 'Depth',
};

const physicalPropertyShape = productSchema.shape.physicalProperties.shape;

/**
 * Validation message for one dimension, read straight off the shared schema so
 * the wording can't drift from what the save actually rejects. Every field is
 * optional, and the input's own pattern refuses a minus sign, so in practice
 * this only ever fires on a literal 0 — which is otherwise indistinguishable
 * from a valid entry until the save FAB silently refuses to submit.
 */
function propertyError(
  propKey: keyof PhysicalProperties,
  value: number | undefined,
): string | undefined {
  return physicalPropertyShape[propKey].safeParse(value).error?.issues[0]?.message;
}

export default function ProductPhysicalProperties({
  product,
  editMode,
  onChangePhysicalProperties,
}: Props) {
  // Callbacks
  const onChangeProperty = useCallback(
    (key: string, value: number | undefined) => {
      const newProperties = { ...product.physicalProperties, [key]: value };
      onChangePhysicalProperties?.(newProperties);
    },
    [product.physicalProperties, onChangePhysicalProperties],
  );

  // Render
  return (
    <View>
      <AppText variant="heading" className="mb-2 font-semibold">
        Measurements
      </AppText>
      <Cube
        width={product.physicalProperties.width}
        height={product.physicalProperties.height}
        depth={product.physicalProperties.depth}
        compact={editMode}
      />
      {/* Four labelled boxes do not say which box is which, that centimetres and
          grams are the units, or what an empty field means — and the audience
          runs out past the lab, where none of that is assumed knowledge. The
          guide link below carries the rest. */}
      {editMode ? (
        <AppText variant="caption" className="mb-1 text-muted-foreground">
          Size and weight of the item as it sits in front of you. Leave a field empty if you did not
          measure it.
        </AppText>
      ) : null}
      {Object.keys(product.physicalProperties).map((prop) => (
        <PhysicalPropertyRow
          key={prop}
          propKey={prop as keyof PhysicalProperties}
          product={product}
          editMode={editMode}
          onChangeProperty={onChangeProperty}
        />
      ))}
      {/* Which dimension is which, and what to do with an item that has no
          meaningful box, is answered in the guide, not guessable from four
          labelled fields. */}
      {editMode ? (
        <DocsLink
          path={DATA_COLLECTION_DOCS_PATH}
          accessibilityLabel="Read the data collection guide"
        >
          How to measure and weigh (guide)
        </DocsLink>
      ) : null}
    </View>
  );
}

function PhysicalPropertyRow({
  propKey,
  product,
  editMode,
  onChangeProperty,
}: {
  propKey: keyof PhysicalProperties;
  product: Product;
  editMode: boolean;
  onChangeProperty: (key: string, value: number | undefined) => void;
}) {
  const handleChange = useCallback(
    (value: number | undefined) => onChangeProperty(propKey, value),
    [onChangeProperty, propKey],
  );

  const value = product.physicalProperties[propKey];

  return (
    <View>
      <Separator />
      <LocalizedFloatInput
        label={nameMap[propKey]}
        value={value}
        unit={unitMap[propKey]}
        editable={editMode}
        onChange={handleChange}
        min={0}
        error={editMode ? propertyError(propKey, value) : undefined}
      />
    </View>
  );
}
