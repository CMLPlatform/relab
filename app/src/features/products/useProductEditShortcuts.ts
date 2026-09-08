import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useShortcutsEnabled } from '@/hooks/useShortcutsEnabled';
import { isPlainShortcut, isTypingTarget } from '@/utils/keyboardShortcuts';

/** A field the keypress belongs to: Escape there clears/undoes the typing. */
function isTextFieldWithText(target: HTMLElement | null): boolean {
  if (!isTypingTarget(target)) return false;
  return (((target as HTMLInputElement).value ?? target?.textContent) || '') !== '';
}

/**
 * Web-only product-page shortcuts: "e" opens the editor, Escape exits through
 * the header back button's guarded path, Cmd/Ctrl+S saves through the FAB/bar
 * handler. Focus-scoped.
 */
export function useProductEditShortcuts({
  editMode,
  canEdit,
  canSave,
  onEdit,
  onSave,
  onExit,
}: {
  editMode: boolean;
  /** Mirrors the Edit FAB's own `visible={ownedByMe}`: no shortcut into an editor the user cannot open. */
  canEdit: boolean;
  /** Save is gated the same way the FAB gates it — invalid forms don't save. */
  canSave: boolean;
  onEdit: () => void;
  onSave: () => void;
  onExit: () => void;
}) {
  // Only "e" answers to the switch: Escape and Cmd/Ctrl+S are not character
  // key shortcuts, so SC 2.1.4 does not cover them and turning them off would
  // cost an editor its save and exit keys for nothing.
  const shortcutsEnabled = useShortcutsEnabled();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return;
      const onKey = (event: KeyboardEvent) => {
        if (!editMode) {
          if (shortcutsEnabled && canEdit && isPlainShortcut(event, 'e')) {
            event.preventDefault();
            onEdit();
          }
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          // Always swallow it: the browser's own save dialog is never what a
          // user pressing Cmd+S on a form wants.
          event.preventDefault();
          if (canSave) onSave();
          return;
        }
        if (event.key !== 'Escape') return;
        if (isTextFieldWithText(event.target as HTMLElement | null)) return;
        onExit();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [editMode, shortcutsEnabled, canEdit, canSave, onEdit, onSave, onExit]),
  );
}
