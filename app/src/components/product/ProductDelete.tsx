import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { useDialog } from '@/components/base/dialogContext';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { entityLabel, entityLabelTitle, type Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onDelete?: () => void;
}

export default function ProductDelete({ product, editMode, onDelete }: Props) {
  const dialog = useDialog();
  const theme = useAppTheme();
  const label = entityLabel(product);
  const titleLabel = entityLabelTitle(product);

  const onPressDelete = () => {
    dialog.alert({
      title: `Delete ${titleLabel}`,
      message: `Are you sure you want to delete this ${label}? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', onPress: () => {} },
        { text: 'Delete', onPress: onDelete },
      ],
    });
  };

  if (typeof product.id !== 'number' || !editMode) {
    return null;
  }

  return (
    <AppButton variant="destructive" onPress={onPressDelete} className={styles.button}>
      <Icon name="trash-2" size={18} color={theme.colors.onError} />
      <AppText style={{ color: theme.colors.onError }}>Delete {label}</AppText>
    </AppButton>
  );
}

const styles = {
  button: 'mt-2.5 mx-3.5 h-[54px] rounded-2xl',
};
