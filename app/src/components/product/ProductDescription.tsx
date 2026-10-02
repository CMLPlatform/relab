import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { PRESS_TINT } from '@/components/base/pressFeedback';
import { TextInput } from '@/components/base/TextInput';
import { useAppTheme } from '@/theme/appThemeContext';
import { entityLabel, type Product } from '@/types/Product';
import { cn } from '@/utils/cn';

const COLLAPSED_DESCRIPTION_LINES = 6;
const APPROX_CHARS_PER_LINE = 55;
const NEWLINE_PATTERN = /\r?\n/;

function shouldCollapseDescription(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 220) return true;

  const estimatedLineCount = trimmed
    .split(NEWLINE_PATTERN)
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
  const { tokens } = useAppTheme();
  const [draftText, setDraftText] = useState(product.description ?? '');
  const [isExpanded, setIsExpanded] = useState(false);
  const text = editMode ? draftText : (product.description ?? '');
  const isLongDescription = useMemo(() => shouldCollapseDescription(text), [text]);
  const expanded = editMode ? true : isExpanded || !isLongDescription;

  const toggleExpanded = useCallback(() => setIsExpanded((current) => !current), []);
  const handleBlur = useCallback(
    () => onChangeDescription?.(draftText),
    [onChangeDescription, draftText],
  );

  // Render
  if (!editMode) {
    return (
      <View style={{ paddingVertical: 8, gap: 10 }}>
        <AppText
          style={{ opacity: text ? 1 : 0.7 }}
          numberOfLines={expanded ? undefined : COLLAPSED_DESCRIPTION_LINES}
        >
          {text ? text : 'No description yet.'}
        </AppText>
        {isLongDescription && (
          <Pressable
            onPress={toggleExpanded}
            className={cn('min-h-11 justify-center self-start rounded-md', PRESS_TINT)}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show less of description' : 'Show more of description'}
          >
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {expanded ? 'Show less' : 'Show more'}
            </AppText>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <TextInput
      // RN TextInput has no `variant`; the body step comes from the tokens.
      style={[{ padding: 14 }, tokens.type.body]}
      placeholder={`Add a ${entityLabel(product)} description`}
      accessibilityLabel="Description"
      value={draftText}
      onChangeText={setDraftText}
      onBlur={handleBlur}
      editable={editMode}
      multiline
      numberOfLines={undefined}
    />
  );
}
