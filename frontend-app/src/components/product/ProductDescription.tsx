import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { TextInput } from '@/components/base/TextInput';

import type { Product } from '@/types/Product';

const COLLAPSED_DESCRIPTION_LINES = 6;
const APPROX_CHARS_PER_LINE = 55;

function shouldCollapseDescription(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 220) return true;

  const estimatedLineCount = trimmed
    .split(/\r?\n/)
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / APPROX_CHARS_PER_LINE)),
      0,
    );

  return estimatedLineCount > COLLAPSED_DESCRIPTION_LINES;
}

interface Props {
  product: Product;
  editMode: boolean;
  onChangeDescription?: (newDescription: string) => void;
}

export default function ProductDescription({ product, editMode, onChangeDescription }: Props) {
  // States
  const [text, setText] = useState(product.description || '');
  const isLongDescription = shouldCollapseDescription(text);
  const [expanded, setExpanded] = useState(!isLongDescription);

  useEffect(() => {
    const nextText = product.description || '';
    setText(nextText);
    setExpanded(!shouldCollapseDescription(nextText));
  }, [product.description]);

  // Render
  if (!editMode) {
    return (
      <View style={{ paddingHorizontal: 14, paddingVertical: 8, gap: 10 }}>
        <Text
          style={{ fontSize: 16, lineHeight: 26, opacity: text ? 1 : 0.7 }}
          numberOfLines={expanded ? undefined : COLLAPSED_DESCRIPTION_LINES}
        >
          {text || 'No description yet.'}
        </Text>
        {isLongDescription && (
          <Pressable
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show less of description' : 'Show more of description'}
          >
            <Text style={{ fontWeight: '600' }}>{expanded ? 'Show less' : 'Show more'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <TextInput
      style={{ padding: 14, fontSize: 16, lineHeight: 26 }}
      placeholder={'Add a product description'}
      value={text}
      onChangeText={setText}
      onBlur={() => onChangeDescription?.(text)}
      editable={editMode}
      multiline
      numberOfLines={expanded ? undefined : COLLAPSED_DESCRIPTION_LINES}
      errorOnEmpty
    />
  );
}
