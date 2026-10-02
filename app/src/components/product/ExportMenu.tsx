import { useCallback, useRef, useState } from 'react';
import { Platform, type View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { VARIANT_FOREGROUND_COLOR } from '@/components/base/appButtonVariants';
import { useDialog } from '@/components/base/dialogContext';
import { Icon } from '@/components/base/Icon';
import { Menu } from '@/components/base/Menu';
import {
  downloadExport,
  type ExportFormat,
  type ProductsQuery,
  productExportUrl,
  productsExportUrl,
} from '@/services/api/products';
import { useAppTheme } from '@/theme/appThemeContext';

type ExportMenuProps = {
  /** Button text, e.g. "Export" or "Export results". */
  label: string;
  /** Export this one base product... */
  productId?: number;
  /** ...or every base product the list query matches. */
  query?: ProductsQuery;
};

/** Export button with a CSV/JSON choice. A refused export shows the server's reason. */
export function ExportMenu({ label, productId, query }: ExportMenuProps) {
  const dialog = useDialog();
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<View>(null);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const run = useCallback(
    async (format: ExportFormat) => {
      setVisible(false);
      setBusy(true);
      try {
        await downloadExport(
          productId === undefined
            ? productsExportUrl(query ?? {}, format)
            : productExportUrl(productId, format),
        );
        dialog.toast(Platform.OS === 'web' ? 'Export downloaded' : 'Export opened in your browser');
      } catch (error) {
        dialog.alert({
          title: 'Export failed',
          message: error instanceof Error ? error.message : 'Try again later.',
          triggerRef: buttonRef,
        });
      } finally {
        setBusy(false);
      }
    },
    [dialog, productId, query],
  );
  const exportCsv = useCallback(() => run('csv'), [run]);
  const exportJson = useCallback(() => run('json'), [run]);

  return (
    <Menu
      visible={visible}
      onDismiss={close}
      triggerRef={buttonRef}
      anchor={
        <AppButton
          ref={buttonRef}
          variant="outline"
          onPress={open}
          loading={busy}
          aria-busy={busy}
          accessibilityLabel={label}
        >
          {busy ? null : (
            <Icon name="download" size="sm" color={VARIANT_FOREGROUND_COLOR.outline(colors)} />
          )}
          {label}
        </AppButton>
      }
    >
      <Menu.Item title="CSV (spreadsheet)" onPress={exportCsv} />
      <Menu.Item title="JSON" onPress={exportJson} />
    </Menu>
  );
}
