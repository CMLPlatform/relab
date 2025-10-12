import { Fragment, useState } from 'react';
import { View } from 'react-native';
import { Card, Divider, Text, TextInput } from 'react-native-paper';
import { PhysicalProperty, Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangePhysicalProperties?: (newProperties: PhysicalProperty[]) => void;
}

export default function ProductPhysicalProperties({ product, editMode, onChangePhysicalProperties }: Props) {
  // Callbacks
  const onChangeProperty = (index: number, newProperty: PhysicalProperty) => {
    const newProperties = [...product.physicalProperties];
    newProperties[index] = newProperty;
    onChangePhysicalProperties?.(newProperties);
  };

  // Render
  return (
    <Card style={{ margin: 10 }}>
      <Card.Title title={'Physical Properties'} titleVariant={'titleLarge'} />
      <Card.Content style={{ margin: 0, padding: 0 }}>
        {product.physicalProperties.map((prop, index) => (
          <Fragment key={index}>
            <PhysicalPropertyCard
              property={prop}
              editMode={editMode}
              onChangeProperty={(newProp) => onChangeProperty(index, newProp)}
            />
            {index < product.physicalProperties.length - 1 && <Divider />}
          </Fragment>
        ))}
      </Card.Content>
    </Card>
  );
}

function PhysicalPropertyCard({
  property,
  editMode,
  onChangeProperty,
}: {
  property: PhysicalProperty;
  editMode: boolean;
  onChangeProperty?: (newProperty: PhysicalProperty) => void;
}) {
  // States
  const [text, setText] = useState(Number.isNaN(property.value) ? '' : property.value.toString());

  // Render
  return (
    <View style={{ margin: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text variant="labelLarge" style={{ paddingHorizontal: 10 }}>
        {property.propertyName}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        {editMode ? (
          <TextInput
            mode={'outlined'}
            style={{ height: 26, width: 80, textAlign: 'right', lineHeight: 24, fontSize: 14 }}
            contentStyle={{ padding: 0, paddingHorizontal: 5 }}
            value={text}
            onChangeText={(s) => {
              if (s.match('^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$') || s === '') {
                setText(s);
                onChangeProperty?.({ ...property, value: parseFloat(s) });
              }
            }}
            textAlign={'right'}
            textAlignVertical={'top'}
            keyboardType={'numeric'}
            placeholder={'Set value'}
            error={text === ''}
          />
        ) : (
          <Text style={{ height: 25, width: 80, textAlign: 'right', padding: 5 }}>{text}</Text>
        )}
        <Text variant="bodyMedium" style={{ width: 30 }}>
          {' ' + property.unit}
        </Text>
      </View>
    </View>
  );
}
