import { View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { FADE_ENTER, FADE_EXIT, ROW_MOVE } from '@/components/base/motion';
import { Separator } from '@/components/base/ui/separator';
import LocalizedFloatInput from '@/components/product/LocalizedFloatInput';
import type { Product, ProductMaterial } from '@/types/Product';
import { heading } from '@/utils/a11y';

interface Props {
  product: Product;
}

/**
 * Recorded bill of materials, as a sub-block of Properties.
 *
 * Read-only: quantities are recorded through `/v1/products/{id}/materials`
 * (base products) or `/v1/components/{id}/materials` (components), not here,
 * so there is no add-row to offer. The line under each row is the source
 * of the material's reference data (density and the like), never of the
 * quantity observed on this product.
 */
export default function ProductMaterials({ product }: Props) {
  const materials = product.materials;

  // Distinct from `[]`: the payload never carried a bill of materials, so
  // saying "none recorded" would be a claim we cannot make.
  if (materials === undefined) return null;

  return (
    <View className="mt-4">
      <View className="mb-2 flex-row items-center gap-1.5">
        <AppText variant="body" {...heading(3)} className="font-semibold">
          Materials
        </AppText>
        <AppText variant="data" className="text-muted-foreground">
          {`(${materials.length})`}
        </AppText>
      </View>
      <LayoutAnimationConfig skipEntering skipExiting>
        {materials.map((material) => (
          <MaterialRow key={material.materialID} material={material} />
        ))}
      </LayoutAnimationConfig>
      {materials.length === 0 ? (
        <AppText className="mb-2 text-muted-foreground">No materials recorded yet.</AppText>
      ) : null}
    </View>
  );
}

function MaterialRow({ material }: { material: ProductMaterial }) {
  return (
    <Animated.View entering={FADE_ENTER} exiting={FADE_EXIT} layout={ROW_MOVE}>
      <Separator />
      {/* The house spec row: name as the label, the recorded quantity as data. */}
      <LocalizedFloatInput
        label={material.name}
        value={material.quantity}
        unit={material.unit}
        editable={false}
      />
      <AppText variant="caption" className="mb-2 px-4 text-muted-foreground">
        {material.source
          ? `Material reference: ${material.source}`
          : 'No reference recorded for this material.'}
      </AppText>
    </Animated.View>
  );
}
