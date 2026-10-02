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
  await renderWithProviders(<Harness />);
  expect(screen.getByText('Camera name')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Camera name'), 'x');
  expect(await screen.findByText('Name is too short')).toBeTruthy();
});

test('the label is the input accessible name, not the placeholder', async () => {
  function Labelled() {
    const { control } = useForm({ defaultValues: { name: '' } });
    return <ControlledTextField control={control} name="name" label="Name" placeholder="Jane" />;
  }
  await renderWithProviders(<Labelled />);
  expect(screen.getByPlaceholderText('Jane')).toHaveAccessibleName('Name');
});

test('a required field says so in its label and marks the input required', async () => {
  function Required() {
    const { control } = useForm({ defaultValues: { name: '' } });
    return (
      <ControlledTextField
        control={control}
        name="name"
        label="Username"
        placeholder="u"
        required
      />
    );
  }
  await renderWithProviders(<Required />);
  expect(screen.getByText('(required)', { exact: false })).toBeTruthy();
  // Native spelling of requiredField(); web gets aria-required.
  expect(screen.getByPlaceholderText('u').props.accessibilityHint).toBe('Required');
  // The marker stays out of the input's accessible name.
  expect(screen.getByPlaceholderText('u')).toHaveAccessibleName('Username');
});
