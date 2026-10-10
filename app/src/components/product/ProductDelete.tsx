import { AppButton } from '@/components/base/AppButton';
import { VARIANT_FOREGROUND_COLOR } from '@/components/base/appButtonVariants';
import { useDialog } from '@/components/base/dialogContext';
import { Icon } from '@/components/base/Icon';
import { Text } from '@/components/base/ui/text';
import { useAppTheme } from '@/theme/appThemeContext';
import { entityLabel, type Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onDelete?: () => void;
}

export default function ProductDelete({ product, editMode, onDelete }: Props) {
  const dialog = useDialog();
  const { colors } = useAppTheme();
  const label = entityLabel(product);

  const onPressDelete = () => {
    dialog.alert({
      title: `Delete this ${label}?`,
      message: deleteMessage(product),
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
          token, same source AppButton's loading spinner uses for this variant. */}
      <Icon name="trash-2" size={18} color={VARIANT_FOREGROUND_COLOR.destructive(colors)} />
      <Text>Delete {label}</Text>
    </AppButton>
  );
}

/**
 * Says what goes with the record. The server deletes the whole subtree and
 * every photo and file on it, which a bare "delete this component?" hides.
 */
function deleteMessage(product: Product): string {
  if (product.components === undefined) {
    return `This deletes the ${entityLabel(product)}, any components under it, and all their photos and files. You cannot undo this.`;
  }
  const count = product.components.length;
  const media = 'its photos and files';
  if (count === 0)
    return `This deletes the ${entityLabel(product)} with ${media}. You cannot undo this.`;
  const children = count === 1 ? '1 component' : `${count} components`;
  return `This also deletes its ${children}, everything recorded under them, and all their photos and files. You cannot undo this.`;
}

const styles = {
  button: 'mt-2.5 mx-3.5',
};
