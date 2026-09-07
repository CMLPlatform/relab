import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ControlledTextField } from '@/components/base/ControlledTextField';
import { renderWithProviders } from '@/test-utils';

const schema = z.object({ name: z.string().min(2, 'Name is too short') });

// biome-ignore lint/style/useComponentExportOnlyModules: test-only harness, not a real module export.
function Harness() {
  const { control } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '' },
  });
  return (
    <ControlledTextField
      control={control}
      name="name"
      label="Camera name"
      placeholder="Camera name"
    />
  );
}

test('renders label, propagates input, and announces the zod error', async () => {
  renderWithProviders(<Harness />);
  expect(screen.getByText('Camera name')).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText('Camera name'), 'x');
  expect(await screen.findByText('Name is too short')).toBeTruthy();
});
