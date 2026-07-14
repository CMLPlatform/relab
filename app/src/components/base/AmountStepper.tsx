import { useCallback } from 'react';
import { View } from 'react-native';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

type AmountStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  label?: string;
};

/** Integer stepper: 8 identical screws are one record with amount 8, not 8 records. */
export function AmountStepper({ value, onChange, min = 1, label = 'Amount' }: AmountStepperProps) {
  const handleDecrement = useCallback(() => onChange(value - 1), [onChange, value]);
  const handleIncrement = useCallback(() => onChange(value + 1), [onChange, value]);

  return (
    <View className="flex-row items-center gap-3">
      <AppText variant="label" className="uppercase opacity-60">
        {label}
      </AppText>
      <AppButton
        variant="outline"
        disabled={value <= min}
        onPress={handleDecrement}
        accessibilityLabel="Decrease amount"
      >
        −
      </AppButton>
      <AppText variant="data">{String(value)}</AppText>
      <AppButton variant="outline" onPress={handleIncrement} accessibilityLabel="Increase amount">
        +
      </AppButton>
    </View>
  );
}
