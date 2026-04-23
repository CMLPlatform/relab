import { Button } from 'react-native-paper';
import { useDialog } from '@/components/common/dialogContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { getProductNameHelperText, productSchema } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';

export function EditNameButton({
  product,
  onProductNameChange,
}: {
  product: Product | undefined;
  onProductNameChange?: (newName: string) => void;
}) {
  const dialog = useDialog();
  const feedback = useAppFeedback();

  return (
    <Button
      onPress={() => {
        if (!product) return;
        dialog.input({
          title: 'Edit name',
          placeholder: 'Product Name',
          helperText: getProductNameHelperText(),
          defaultValue: product.name || '',
          buttons: [
            { text: 'Cancel' },
            {
              text: 'OK',
              disabled: (value) => {
                const parseResult = productSchema.shape.name.safeParse(value);
                return !parseResult.success;
              },
              onPress: (newName) => {
                const name = typeof newName === 'string' ? newName.trim() : '';
                const parseResult = productSchema.shape.name.safeParse(name);
                if (!parseResult.success) {
                  feedback.error(
                    parseResult.error.issues[0]?.message || 'Invalid product name',
                    'Invalid product name',
                  );
                  return;
                }
                onProductNameChange?.(name);
              },
            },
          ],
        });
      }}
    >
      Edit name
    </Button>
  );
}
