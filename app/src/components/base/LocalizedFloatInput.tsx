import { useRef, useState } from 'react';
import type RN from 'react-native';
import { Platform, Pressable } from 'react-native';
import { Text } from './Text';
import { TextInput } from './TextInput';

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

// The locale is fixed for the session, so resolve the separator and its validation
// pattern once at module load rather than on every keystroke.
const DECIMAL_SEPARATOR = getDecimalSeparator();
const DECIMAL_PATTERN = new RegExp(`^\\d*[${DECIMAL_SEPARATOR.replace('.', '\\.')}]?\\d*$`);

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
  const normalizedValue = value == null || Number.isNaN(value) ? undefined : value;
  const [text, setText] = useState(() => toLocalizedString(normalizedValue, DECIMAL_SEPARATOR));

  // Resync the field when the `value` prop changes externally (async load, refetch,
  // parent reset). This can't clobber typing: the parent only gets updates on blur,
  // so `normalizedValue` is stable while the user types and this stays idle.
  // Render-phase reset rather than an effect — no cascading render, no stale frame.
  const [syncedValue, setSyncedValue] = useState(normalizedValue);
  if (normalizedValue !== syncedValue) {
    setSyncedValue(normalizedValue);
    setText(toLocalizedString(normalizedValue, DECIMAL_SEPARATOR));
  }

  const inputStyle = {
    textAlign: Platform.OS === 'web' ? 'right' : undefined,
    height: 38,
    paddingHorizontal: 10,
    marginVertical: 2,
    borderRadius: 50,
    ...style,
  } as RN.TextStyle;
  const webOnlyInputStyle =
    Platform.OS === 'web'
      ? ({ outline: 'none', fieldSizing: 'content' } as unknown as RN.TextStyle)
      : undefined;

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

    const normalizedText = normalizeDecimalString(text, DECIMAL_SEPARATOR);
    const numValue = parseFloat(normalizedText);

    if (!Number.isNaN(numValue) && numValue >= min) {
      onChange?.(numValue);
    } else {
      setText(toLocalizedString(normalizedValue, DECIMAL_SEPARATOR));
    }
  };

  const handleChangeText = (s: string) => {
    if (DECIMAL_PATTERN.test(s) || s === '') {
      setText(s);
    }
  };

  const inputContent = (
    <>
      <TextInput
        style={[inputStyle, webOnlyInputStyle]}
        value={text}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        keyboardType={'decimal-pad'}
        placeholder={placeholder}
        editable={editable}
        ref={textInput}
      />
      {unit ? (
        <Text
          style={{
            fontWeight: 'bold',
            width: 30,
          }}
        >
          {unit}
        </Text>
      ) : null}
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
