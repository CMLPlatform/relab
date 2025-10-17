import { Fragment } from 'react';
import { View } from 'react-native';
import { Divider } from 'react-native-paper';
import { InfoTooltip, Text } from '@/components/base';
import LocalizedFloatInput from '@/components/base/LocalizedFloatInput';
import Cube from '@/components/common/SVGCube';
import { PhysicalProperties, Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangePhysicalProperties?: (newProperties: PhysicalProperties) => void;
}

const unitMap = {
  weight: 'kg',
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

export default function ProductPhysicalProperties({ product, editMode, onChangePhysicalProperties }: Props) {
  // Callbacks
  const onChangeProperty = (key: string, value: number | undefined) => {
    const newProperties = { ...product.physicalProperties, [key]: value };
    onChangePhysicalProperties?.(newProperties);
  };

  // Render
  return (
    <View>
      <Text
        style={{
          marginBottom: 12,
          paddingLeft: 14,
          fontSize: 24,
          fontWeight: 'bold',
        }}
      >
        Physical Properties <InfoTooltip title="Must be greater than 0. Assume a bounding box for the dimensions." />
      </Text>

      <Cube
        width={product.physicalProperties.width}
        height={product.physicalProperties.height}
        depth={product.physicalProperties.depth}
      />
      {Object.keys(product.physicalProperties).map((prop, index) => (
        <Fragment key={index}>
          <Divider />
          <LocalizedFloatInput
            label={nameMap[prop as keyof PhysicalProperties]}
            value={product.physicalProperties[prop as keyof PhysicalProperties]}
            unit={unitMap[prop as keyof PhysicalProperties]}
            editable={editMode}
            onChange={(value: number | undefined) => onChangeProperty(prop, value)}
            min={0}
            placeholder="> 0"
          />
        </Fragment>
      ))}
    </View>
  );
}
