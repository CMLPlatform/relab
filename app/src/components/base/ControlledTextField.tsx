import { useId } from 'react';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';
import { type TextInputProps, View } from 'react-native';
import { describedBy } from '@/utils/a11y';
import { AppText } from './AppText';
import { FormFieldError } from './FormField';
import { TextInput } from './TextInput';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  /** Sanitize/transform keystrokes before they reach the form state (e.g. pairing-code uppercase). */
  transform?: (text: string) => string;
};

/**
 * RHF Controller + label + TextInput + FormFieldError in one unit, with the
 * error programmatically linked to the input (WCAG 1.3.1/3.3.1) — the wiring
 * every call site previously hand-rolled, inconsistently.
 */
export function ControlledTextField<T extends FieldValues>({
  control,
  name,
  label,
  transform,
  ...inputProps
}: Props<T>) {
  const errorId = useId();
  return (
    <Controller
      control={control}
      name={name}
      // biome-ignore lint/performance/noJsxPropsBind: Controller's render prop is the RHF API; it closes over this field's props.
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <View className="gap-1">
          {label ? <AppText variant="label">{label}</AppText> : null}
          <TextInput
            value={(value as string) ?? ''}
            // biome-ignore lint/performance/noJsxPropsBind: per-field transform needs the field's own onChange.
            onChangeText={(text) => onChange(transform ? transform(text) : text)}
            bordered
            {...describedBy(errorId, Boolean(error?.message))}
            {...inputProps}
          />
          <FormFieldError errorId={errorId} message={error?.message} reserveSpace />
        </View>
      )}
    />
  );
}
