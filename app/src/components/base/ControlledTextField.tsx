import { useId } from 'react';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';
import { type TextInputProps, View } from 'react-native';
import { describedBy, requiredField } from '@/utils/a11y';
import { AppText } from './AppText';
import { FormFieldError } from './FormField';
import { TextInput } from './TextInput';

type Props<T extends FieldValues> = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  /** A field the form cannot submit without: "(required)" in the label plus requiredField(). */
  required?: boolean;
  /** Sanitize/transform keystrokes before they reach the form state (e.g. pairing-code uppercase). */
  transform?: (text: string) => string;
};

/** RHF Controller + label + TextInput + FormFieldError, with the error linked to the input (WCAG 1.3.1/3.3.1). */
export function ControlledTextField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
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
          {label ? (
            <AppText variant="label">
              {label}
              {required ? (
                <AppText variant="label" className="text-muted-foreground">
                  {' '}
                  (required)
                </AppText>
              ) : null}
            </AppText>
          ) : null}
          <TextInput
            value={(value as string) ?? ''}
            // biome-ignore lint/performance/noJsxPropsBind: per-field transform needs the field's own onChange.
            onChangeText={(text) => onChange(transform ? transform(text) : text)}
            bordered
            accessibilityLabel={label}
            {...(required ? requiredField() : null)}
            {...describedBy(errorId, Boolean(error?.message))}
            {...inputProps}
          />
          <FormFieldError errorId={errorId} message={error?.message} reserveSpace />
        </View>
      )}
    />
  );
}
