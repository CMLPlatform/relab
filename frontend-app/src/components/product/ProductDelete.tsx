import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { useDialog } from '@/components/common/dialogContext';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onDelete?: () => void;
}

export default function ProductDelete({ product, editMode, onDelete }: Props) {
  const dialog = useDialog();
  const theme = useAppTheme();

  const onPressDelete = () => {
    dialog.alert({
      title: 'Delete Product',
      message: 'Are you sure you want to delete this product? This action cannot be undone.',
      buttons: [
        { text: 'Cancel', onPress: () => {} },
        { text: 'Delete', onPress: onDelete },
      ],
    });
  };

  if (product?.id === 'new' || !editMode) {
    return null;
  }

  return (
    <Button
      mode="contained"
      onPress={onPressDelete}
      icon={'delete'}
      style={[styles.button, { backgroundColor: theme.colors.error }]}
      textColor={theme.colors.onError}
    >
      Delete product
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 10,
    marginHorizontal: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
});
