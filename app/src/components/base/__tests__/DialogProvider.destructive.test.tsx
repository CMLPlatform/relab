import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useDialog } from '@/components/base/dialogContext';
import { renderWithProviders, setupUser } from '@/test-utils/index';

function renderTrigger(onPress: () => void) {
  return (
    <Pressable testID="trigger" onPress={onPress}>
      <Text>open</Text>
    </Pressable>
  );
}

describe('DialogProvider destructive action hierarchy', () => {
  const user = setupUser();

  it('Enter in an input dialog never fires the destructive action', async () => {
    const onDelete = jest.fn();

    function Trigger() {
      const dialog = useDialog();
      return renderTrigger(() =>
        dialog.input({
          title: 'Delete product',
          placeholder: 'Product name',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ],
        }),
      );
    }

    renderWithProviders(<Trigger />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));
    // submitEditing is a custom event not supported by userEvent
    fireEvent(screen.getByPlaceholderText('Product name'), 'submitEditing');

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('a destructive button renders with the destructive fill', async () => {
    function Trigger() {
      const dialog = useDialog();
      return renderTrigger(() =>
        dialog.alert({
          title: 'Delete product',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive' },
          ],
        }),
      );
    }

    renderWithProviders(<Trigger />, { withDialog: true });

    await user.press(screen.getByTestId('trigger'));

    expect(screen.getByRole('button', { name: 'Delete' }).props.className).toEqual(
      expect.stringContaining('bg-destructive'),
    );
    expect(screen.getByRole('button', { name: 'Cancel' }).props.className).not.toEqual(
      expect.stringContaining('bg-destructive'),
    );
  });

  // The button Enter/return submits (pickSubmitButton) gets the same visual
  // weight as the keyboard default: AppButton's primary fill, not ghost.
  it('the submit action gets the primary emphasis; cancel stays ghost', async () => {
    function Trigger() {
      const dialog = useDialog();
      return renderTrigger(() =>
        dialog.alert({
          title: 'Sign out?',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', onPress: () => {} },
          ],
        }),
      );
    }

    renderWithProviders(<Trigger />, { withDialog: true });
    await user.press(screen.getByTestId('trigger'));

    const submitClassName = screen.getByRole('button', { name: 'Sign out' }).props
      .className as string;
    const cancelClassName = screen.getByRole('button', { name: 'Cancel' }).props
      .className as string;

    // Exact-token check: ghost's className also contains the substring
    // "bg-primary" (inside "active:bg-primary/10"), so a plain
    // stringContaining check can't tell the variants apart.
    expect(submitClassName.split(' ')).toContain('bg-primary');
    expect(cancelClassName.split(' ')).not.toContain('bg-primary');
  });
});
