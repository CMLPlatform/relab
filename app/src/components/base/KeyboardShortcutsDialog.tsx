import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { Switch } from '@/components/base/ui/switch';
import { setShortcutsEnabled, useShortcutsEnabled } from '@/hooks/useShortcutsEnabled';
import { useAppTheme } from '@/theme';
import { isPlainShortcut } from '@/utils/keyboardShortcuts';

const isMac =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Every web shortcut in the app. Grouped by where it applies, because all of
 * them but "?" are focus-scoped to one screen — a flat list would promise
 * bindings that do nothing on the screen the reader is looking at.
 */
const SHORTCUT_GROUPS: { title: string; items: [key: string, action: string][] }[] = [
  {
    title: 'Anywhere',
    items: [['?', 'Show shortcuts']],
  },
  {
    title: 'Products list',
    items: [
      ['/', 'Search products'],
      ['n', 'New product'],
      ['f', 'Filters'],
    ],
  },
  {
    title: 'Product page',
    items: [
      ['e', 'Edit'],
      ['Esc', 'Leave edit mode'],
      [isMac ? '⌘ S' : 'Ctrl + S', 'Save'],
    ],
  },
];

/**
 * The "?" overlay. Mounted once at the app shell; keyboard-only, so it never
 * renders on native. AppDialog's Modal handles Escape and the return focus.
 */
export function KeyboardShortcutsDialog() {
  const [visible, setVisible] = useState(false);
  const shortcutsEnabled = useShortcutsEnabled();
  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      // NOTE: "?" deliberately ignores the single-key switch below. It is the
      // only route back to that switch, and it opens a dialog rather than
      // acting, so a stray press costs an Escape. Give the overlay a visible
      // control (a TopNav button) and this can answer to the switch too.
      // isPlainShortcut already ignores the press while a dialog is open, so
      // this opens but never toggles; Escape closes it.
      if (!isPlainShortcut(event, '?')) return;
      event.preventDefault();
      setVisible(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <AppDialog visible={visible} onDismiss={hide}>
      <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
        Keyboard shortcuts
      </AppText>
      {SHORTCUT_GROUPS.map((group) => (
        <ShortcutGroup
          key={group.title}
          title={group.title}
          items={group.items}
          dimmed={!shortcutsEnabled}
        />
      ))}
      <ShortcutsSwitch enabled={shortcutsEnabled} />
      <View style={dialogActionsStyle}>
        <AppButton variant="ghost" onPress={hide}>
          Close
        </AppButton>
      </View>
    </AppDialog>
  );
}

function ShortcutGroup({
  title,
  items,
  dimmed,
}: {
  title: string;
  items: [string, string][];
  dimmed: boolean;
}) {
  return (
    <View className="mt-3" style={dimmed ? { opacity: 0.45 } : undefined}>
      <AppText variant="caption" accessibilityRole="header">
        {title}
      </AppText>
      {items.map(([key, action]) => (
        <ShortcutRow key={`${title}:${key}`} shortcutKey={key} action={action} />
      ))}
    </View>
  );
}

/**
 * The SC 2.1.4 off switch. Escape and Cmd/Ctrl+S stay bound either way, so the
 * copy promises only what the switch actually controls.
 */
function ShortcutsSwitch({ enabled }: { enabled: boolean }) {
  return (
    <View className="mt-5 flex-row items-start justify-between gap-3 border-t border-border pt-3">
      <View className="flex-1">
        <AppText className="font-semibold">Single-key shortcuts</AppText>
        <AppText variant="caption">
          Turn these off if a stray keystroke keeps triggering them. Escape and Save keep working.
        </AppText>
      </View>
      <Switch
        checked={enabled}
        onCheckedChange={setShortcutsEnabled}
        accessibilityLabel="Single-key shortcuts"
      />
    </View>
  );
}

function ShortcutRow({ shortcutKey, action }: { shortcutKey: string; action: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center justify-between gap-4 py-1">
      <AppText>{action}</AppText>
      <AppText
        variant="caption"
        className="px-2 py-0.5 border rounded"
        style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
      >
        {shortcutKey}
      </AppText>
    </View>
  );
}
