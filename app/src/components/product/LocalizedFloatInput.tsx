import { useId, useRef, useState } from 'react';
import type RN from 'react-native';
import { Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { FormFieldError } from '@/components/base/FormField';
import { TextInput } from '@/components/base/TextInput';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { describedBy } from '@/utils/a11y';

interface LocalizedFloatInputProps {
  value: number | undefined;
  onChange?: (value: number | undefined) => void;
  editable?: boolean;
  placeholder?: string;
  unit?: string;
  label?: string;
  min?: number;
  style?: object;
  /** Validation message for the current value; rendered and linked to the input. */
  error?: string;
}

/** The user's locale decimal separator. */
function getDecimalSeparator(): string {
  const localeToUse = typeof navigator !== 'undefined' ? navigator.language : undefined;
  try {
    const formatted = localeToUse ? (1.1).toLocaleString(localeToUse) : (1.1).toLocaleString();
    return formatted.charAt(1); // The character between 1 and 1
  } catch {
    // A malformed tag (`en-US@posix` from some Linux browsers) throws a RangeError
    // at module load, which took the whole app down rather than one input.
    return '.';
  }
}

// The locale is fixed for the session.
const DECIMAL_SEPARATOR = getDecimalSeparator();
const DECIMAL_PATTERN = new RegExp(`^\\d*[${DECIMAL_SEPARATOR.replace('.', '\\.')}]?\\d*$`);

/** Localized number string to dot-decimal. */
function normalizeDecimalString(text: string, decimalSeparator: string): string {
  return decimalSeparator === '.' ? text : text.replace(decimalSeparator, '.');
}

/** Number to localized display format. */
function toLocalizedString(value: number | undefined, decimalSeparator: string): string {
  if (value === undefined) return '';
  const standardString = value.toString();
  return decimalSeparator === '.' ? standardString : standardString.replace('.', decimalSeparator);
}

// Read mode renders the Spec Row (DESIGN.md), not a disabled input, which
// reads as a form control to assistive tech.
function ReadOnlySpecRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | undefined;
  unit: string | undefined;
}) {
  return (
    <View className="px-4 py-2">
      <AppText variant="eyebrow" className="text-manila">
        {label}
      </AppText>
      <AppText variant="data">
        {value === undefined
          ? '—'
          : `${toLocalizedString(value, DECIMAL_SEPARATOR)} ${unit ?? ''}`.trim()}
      </AppText>
    </View>
  );
}

export default function LocalizedFloatInput({
  value,
  onChange,
  editable = true,
  placeholder = 'e.g. 12',
  unit,
  label,
  min = 0,
  style,
  error,
}: LocalizedFloatInputProps) {
  const textInput = useRef<RN.TextInput>(null);
  const errorId = useId();
  const normalizedValue = value == null || Number.isNaN(value) ? undefined : value;
  const [text, setText] = useState(() => toLocalizedString(normalizedValue, DECIMAL_SEPARATOR));

  // Resync on an external `value` change. Cannot clobber typing: the parent
  // only gets updates on blur.
  const [syncedValue, setSyncedValue] = useState(normalizedValue);
  if (normalizedValue !== syncedValue) {
    setSyncedValue(normalizedValue);
    setText(toLocalizedString(normalizedValue, DECIMAL_SEPARATOR));
  }

  const inputStyle = {
    textAlign: Platform.OS === 'web' ? 'right' : undefined,
    height: MIN_TAP_TARGET,
    paddingHorizontal: 10,
    marginVertical: 2,
    borderRadius: radius.control,
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
        accessibilityLabel={label}
        {...describedBy(errorId, Boolean(error))}
      />
      {unit ? (
        <AppText
          variant="label"
          style={{
            fontWeight: 'bold',
            width: 30,
          }}
        >
          {unit}
        </AppText>
      ) : null}
    </>
  );

  if (label && !editable) {
    return <ReadOnlySpecRow label={label} value={normalizedValue} unit={unit} />;
  }

  // FormFieldError renders nothing without a message.
  if (label) {
    return (
      <View>
        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 15,
            gap: 2,
          }}
          onPress={onPress}
        >
          <AppText
            variant="body"
            style={{
              flexGrow: 2,
            }}
          >
            {label}
          </AppText>
          {inputContent}
        </Pressable>
        <FormFieldError errorId={errorId} message={error} style={{ paddingHorizontal: 15 }} />
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={onPress}>{inputContent}</Pressable>
      <FormFieldError errorId={errorId} message={error} />
    </View>
  );
}
