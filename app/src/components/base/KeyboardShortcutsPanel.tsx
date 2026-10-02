import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { Switch } from '@/components/base/ui/switch';
import { setShortcutsEnabled, useShortcutsEnabled } from '@/hooks/useShortcutsEnabled';
import { closeShortcutsOverlay, useShortcutsOverlayOpen } from '@/hooks/useShortcutsOverlay';
import { useAppTheme } from '@/theme/appThemeContext';
import { heading } from '@/utils/a11y';

export type ShortcutGroupSpec = { title: string; items: [key: string, action: string][] };

/**
 * "?" is the only binding this dialog owns; every other one is focus-scoped to a
 * screen, so its descriptions come from the feature that registers it.
 */
const ANYWHERE_GROUP: ShortcutGroupSpec = {
  title: 'Anywhere',
  items: [['?', 'Show shortcuts']],
};

export function KeyboardShortcutsPanel({ groups }: { groups: ShortcutGroupSpec[] }) {
  const visible = useShortcutsOverlayOpen();
  const shortcutsEnabled = useShortcutsEnabled();

  return (
    <AppDialog
      visible={visible}
      onDismiss={closeShortcutsOverlay}
      accessibilityLabel="Keyboard shortcuts"
    >
      <AppText variant="title" {...heading(2)} style={dialogTitleStyle}>
        Keyboard shortcuts
      </AppText>
      {[ANYWHERE_GROUP, ...groups].map((group) => (
        <ShortcutGroup
          key={group.title}
          title={group.title}
          items={group.items}
          dimmed={!shortcutsEnabled}
        />
      ))}
      <ShortcutsSwitch enabled={shortcutsEnabled} />
      <View style={dialogActionsStyle}>
        <AppButton variant="ghost" onPress={closeShortcutsOverlay}>
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
      <AppText variant="caption" {...heading(3)}>
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
        className="px-2 py-0.5 border rounded-md"
        style={{ borderColor: colors.outline, color: colors.mutedForeground }}
      >
        {shortcutKey}
      </AppText>
    </View>
  );
}
