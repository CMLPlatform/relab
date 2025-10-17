import { useRef, useState } from 'react';
import RN, { Platform, Pressable } from 'react-native';
import { Text, TextInput } from '@/components/base';

interface LocalizedFloatInputProps {
  value: number | undefined;
  onChange?: (value: number | undefined) => void;
  editable?: boolean;
  placeholder?: string;
  unit?: string;
  label?: string;
  min?: number;
  style?: object;
}

/**
 * Gets the user's decimal separator based on their locale
 */
function getDecimalSeparator(): string {
  const localeToUse = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const formatted = localeToUse ? (1.1).toLocaleString(localeToUse) : (1.1).toLocaleString();
  return formatted.charAt(1); // The character between 1 and 1
}

/**
 * Converts a localized number string to standard dot-decimal format
 */
function normalizeDecimalString(text: string, decimalSeparator: string): string {
  return decimalSeparator === '.' ? text : text.replace(decimalSeparator, '.');
}

/**
 * Converts a standard number to localized display format
 */
function toLocalizedString(value: number | undefined, decimalSeparator: string): string {
  if (value === undefined) return '';
  const standardString = value.toString();
  return decimalSeparator === '.' ? standardString : standardString.replace('.', decimalSeparator);
}

export default function LocalizedFloatInput({
  value,
  onChange,
  editable = true,
  placeholder = '> 0',
  unit,
  label,
  min = 0,
  style,
}: LocalizedFloatInputProps) {
  const textInput = useRef<RN.TextInput>(null);
  const decimalSeparator = getDecimalSeparator();
  const normalizedValue = value == null || Number.isNaN(value) ? undefined : value;
  const [text, setText] = useState(toLocalizedString(normalizedValue, decimalSeparator));

  const decimalRegex = new RegExp(`^\\d*[${decimalSeparator.replace('.', '\\.')}]?\\d*$`);

  const onPress = () => {
    if (editable) {
      textInput.current?.focus();
    }
  };

  const handleBlur = () => {
    if (text.trim() === '') {
      onChange?.(undefined);
      return;
    }

    const normalizedText = normalizeDecimalString(text, decimalSeparator);
    const numValue = parseFloat(normalizedText);

    if (!isNaN(numValue) && numValue >= min) {
      onChange?.(numValue);
    } else {
      setText(toLocalizedString(normalizedValue, decimalSeparator));
    }
  };

  const handleChangeText = (s: string) => {
    if (decimalRegex.test(s) || s === '') {
      setText(s);
    }
  };

  const inputContent = (
    <>
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
          ...style,
        }}
        value={text}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        keyboardType={'decimal-pad'}
        placeholder={placeholder}
        editable={editable}
        ref={textInput}
      />
      {unit && (
        <Text
          style={{
            fontWeight: 'bold',
            width: 30,
          }}
        >
          {unit}
        </Text>
      )}
    </>
  );

  if (label) {
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
          {label}
        </Text>
        {inputContent}
      </Pressable>
    );
  }

  return <Pressable onPress={onPress}>{inputContent}</Pressable>;
}
