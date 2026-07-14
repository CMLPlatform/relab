import { useCallback } from 'react';
import { View } from 'react-native';
import { Divider } from 'react-native-paper';
import LocalizedFloatInput from '@/components/base/LocalizedFloatInput';
import Cube from '@/components/base/SVGCube';
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
      <Cube
        width={product.physicalProperties.width}
        height={product.physicalProperties.height}
        depth={product.physicalProperties.depth}
      />
      {Object.keys(product.physicalProperties).map((prop) => (
        <PhysicalPropertyRow
          key={prop}
          propKey={prop as keyof PhysicalProperties}
          product={product}
          editMode={editMode}
          onChangeProperty={onChangeProperty}
        />
      ))}
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

  return (
    <View>
      <Divider />
      <LocalizedFloatInput
        label={nameMap[propKey]}
        value={product.physicalProperties[propKey]}
        unit={unitMap[propKey]}
        editable={editMode}
        onChange={handleChange}
        min={0}
        placeholder="> 0"
      />
    </View>
  );
}
