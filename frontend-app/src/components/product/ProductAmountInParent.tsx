import { MaterialCommunityIcons } from '@expo/vector-icons';
import { JSX, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, IconButton, Text, TextInput } from 'react-native-paper';

import { InfoTooltip } from '@/components/base';
import { Product } from '@/types/Product';

type ProductAmountInParentProps = {
  product: Product;
  editMode: boolean;
  onAmountChange: (newAmount: number) => void;
};

export default function ProductAmountInParent({
  product,
  editMode,
  onAmountChange,
}: ProductAmountInParentProps): JSX.Element {
  const amount = product.amountInParent ?? 1;
  const [inputValue, setInputValue] = useState(amount.toString());

  // Sync local state when product.amountInParent changes
  useEffect(() => {
    setInputValue(amount.toString());
  }, [amount]);

  const handleTextChange = (text: string) => {
    // Allow empty string for deletion
    setInputValue(text);

    // Remove non-numeric characters
    const numericText = text.replace(/[^0-9]/g, '');

    if (numericText === '') {
      return; // Don't update amount while user is typing
    }

    const value = parseInt(numericText, 10);

    // Clamp between 1 and 10000
    if (value >= 1 && value <= 10000) {
      onAmountChange(value);
    }
  };

  const handleBlur = () => {
    // On blur, ensure we have a valid value
    const numericText = inputValue.replace(/[^0-9]/g, '');
    if (numericText === '' || parseInt(numericText, 10) < 1) {
      onAmountChange(1);
      setInputValue('1');
    } else if (parseInt(numericText, 10) > 10000) {
      onAmountChange(10000);
      setInputValue('10000');
    } else {
      setInputValue(numericText);
    }
  };

  const increment = () => {
    const newAmount = Math.min(amount + 1, 10000);
    onAmountChange(newAmount);
    setInputValue(newAmount.toString());
  };

  const decrement = () => {
    const newAmount = Math.max(amount - 1, 1);
    onAmountChange(newAmount);
    setInputValue(newAmount.toString());
  };

  return (
    <Card>
      <Card.Content style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="titleMedium">Amount in Parent</Text>
          <InfoTooltip title="How many times this component occurs in its parent" />
        </View>
        {editMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton
              icon={() => <MaterialCommunityIcons name="minus" size={24} />}
              onPress={decrement}
              disabled={amount <= 1}
              mode="outlined"
              size={20}
            />
            <TextInput
              mode="outlined"
              label="Quantity"
              value={inputValue}
              onChangeText={handleTextChange}
              onBlur={handleBlur}
              keyboardType="numeric"
              placeholder="1"
              dense
              style={{ flex: 1 }}
            />
            <IconButton
              icon={() => <MaterialCommunityIcons name="plus" size={24} />}
              onPress={increment}
              disabled={amount >= 10000}
              mode="outlined"
              size={20}
            />
          </View>
        ) : (
          <View>
            <Text variant="bodyLarge">{amount}</Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}
