import { Fragment, useRef, useState } from 'react';
import RN, { Platform, Pressable, View } from 'react-native';
import { Divider } from 'react-native-paper';
import { InfoTooltip, Text, TextInput } from '@/components/base';
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
    // Ensure NaN is converted to undefined before saving
    const normalizedValue = value === undefined || Number.isNaN(value) ? undefined : value;
    const newProperties = { ...product.physicalProperties, [key]: normalizedValue };
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
          <PhysicalPropertyRow
            name={nameMap[prop as keyof PhysicalProperties]}
            value={product.physicalProperties[prop as keyof PhysicalProperties]}
            unit={unitMap[prop as keyof PhysicalProperties]}
            editMode={editMode}
            onChangeProperty={onChangeProperty}
          />
        </Fragment>
      ))}
    </View>
  );
}

function PhysicalPropertyRow({
  name,
  value,
  unit,
  editMode,
  onChangeProperty,
}: {
  name: string;
  value: number | undefined;
  unit: string;
  editMode: boolean;
  onChangeProperty?: (name: string, value: number | undefined) => void;
}) {
  // Hooks
  const textInput = useRef<RN.TextInput>(null);

  // Normalize value: convert NaN, null, or undefined to undefined
  const normalizedValue = value == null || Number.isNaN(value) ? undefined : value;

  // States
  const [text, setText] = useState(normalizedValue === undefined ? '' : normalizedValue.toString());

  // Callbacks
  const onPress = () => {
    if (editMode) {
      textInput.current?.focus();
    }
  };

  const handleBlur = () => {
    if (text.trim() === '') {
      onChangeProperty?.(name.toLowerCase(), undefined);
      return;
    }
    const numValue = parseFloat(text);
    // Only save if valid positive number > 0
    if (!isNaN(numValue) && numValue > 0) {
      onChangeProperty?.(name.toLowerCase(), numValue);
    } else {
      // Reset to previous value if invalid
      setText(normalizedValue === undefined ? '' : normalizedValue.toString());
    }
  };

  // Render
  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        gap: 2,
      }}
      onPress={onPress}
    >
      <Text
        style={{
          flexGrow: 2,
        }}
      >
        {name}
      </Text>
      <TextInput
        style={{
          textAlign: Platform.OS === 'web' ? 'right' : undefined,
          outline: 'none',
          height: 38,
          paddingHorizontal: 10,
          marginVertical: 2,
          borderRadius: 50,
          // @ts-ignore because this works on the web
          fieldSizing: 'content',
        }}
        value={text}
        onChangeText={(s) => {
          // Allow only positive numbers (including decimals) or empty string
          if (/^\d*\.?\d*$/.test(s) || s === '') {
            setText(s);
          }
        }}
        onBlur={handleBlur}
        keyboardType={'decimal-pad'}
        placeholder={'> 0'}
        editable={editMode}
        ref={textInput}
      />
      <Text
        style={{
          fontWeight: 'bold',
          width: 30,
        }}
      >
        {unit}
      </Text>
    </Pressable>
  );
}
