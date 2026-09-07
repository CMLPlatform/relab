import { AppButton } from '@/components/base/AppButton';
import { VARIANT_FOREGROUND_COLOR } from '@/components/base/appButtonVariants';
import { useDialog } from '@/components/base/dialogContext';
import { Icon } from '@/components/base/Icon';
import { Text } from '@/components/base/ui/text';
import { useAppTheme } from '@/theme';
import { entityLabel, entityLabelTitle, type Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onDelete?: () => void;
}

export default function ProductDelete({ product, editMode, onDelete }: Props) {
  const dialog = useDialog();
  const { colors } = useAppTheme();
  const label = entityLabel(product);
  const titleLabel = entityLabelTitle(product);

  const onPressDelete = () => {
    dialog.alert({
      title: `Delete ${titleLabel}`,
      message: `Are you sure you want to delete this ${label}? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    });
  };

  if (typeof product.id !== 'number' || !editMode) {
    return null;
  }

  return (
    <AppButton variant="destructive" onPress={onPressDelete} className={styles.button}>
      {/* Icon needs an explicit color (no CSS-var bridging for RN SVG icons), so it
          reads the destructive variant's own foreground instead of a hand-picked
          token — same source AppButton's loading spinner uses for this variant. */}
      <Icon name="trash-2" size={18} color={VARIANT_FOREGROUND_COLOR.destructive(colors)} />
      <Text>Delete {label}</Text>
    </AppButton>
  );
}

const styles = {
  button: 'mt-2.5 mx-3.5',
};
