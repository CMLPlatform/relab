import { useState } from 'react';
import { Text, TextInput } from 'react-native-paper';

import { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onChangeDescription?: (newDescription: string) => void;
}

export default function ProductDescription({ product, editMode, onChangeDescription }: Props) {
  // States
  const [text, setText] = useState(product.description || '');
  const [height, setHeight] = useState(40);

  // Sub Render >> View Mode
  if (!editMode) {
    return (
      <Text style={{ margin: 14 }}>
        <Text variant="bodyLarge" style={{ opacity: 0.8 }}>
          {text}
        </Text>
      </Text>
    );
  }

  // Render
  return (
    <TextInput
      contentStyle={{ lineHeight: 24, padding: 14, paddingTop: 14, height: height }}
      onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
      placeholder={'Add a product description'}
      value={text}
      onChangeText={(text) => {
        setText(text);
        onChangeDescription?.(text);
      }}
      multiline={true}
      error={text === ''}
    />
  );
}
