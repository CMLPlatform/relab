import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

/** A field the keypress belongs to: Escape there clears/undoes the typing. */
function isTextFieldWithText(target: HTMLElement | null): boolean {
  if (!target) return false;
  const isTextField =
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    // contenteditable hosts and ARIA-only textboxes take text too, but carry
    // neither tag name.
    target.isContentEditable ||
    target.getAttribute?.('role') === 'textbox';
  if (!isTextField) return false;
  return (((target as HTMLInputElement).value ?? target.textContent) || '') !== '';
}

/**
 * Web-only edit-mode shortcuts for the product detail screen: Escape exits edit
 * mode through the same guarded path as the header back button (so the
 * discard/confirm prompt is unchanged), Cmd/Ctrl+S saves through the same
 * handler as the save FAB/bar. Scoped with useFocusEffect so a backgrounded
 * screen doesn't keep listening.
 */
export function useProductEditShortcuts({
  editMode,
  canSave,
  onSave,
  onExit,
}: {
  editMode: boolean;
  /** Save is gated the same way the FAB gates it — invalid forms don't save. */
  canSave: boolean;
  onSave: () => void;
  onExit: () => void;
}) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || !editMode) return;
      const onKey = (event: KeyboardEvent) => {
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
    }, [editMode, canSave, onSave, onExit]),
  );
}
