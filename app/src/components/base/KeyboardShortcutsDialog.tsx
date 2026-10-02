import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  closeShortcutsOverlay,
  openShortcutsOverlay,
  useShortcutsOverlayOpen,
} from '@/hooks/useShortcutsOverlay';
import { isPlainShortcut } from '@/utils/keyboardShortcuts';
import type { ShortcutGroupSpec } from './KeyboardShortcutsPanel';
import { LazyBoundary } from './LazyBoundary';
import { lazyWithRetry } from './lazyWithRetry';

// NOTE: the panel loads on first open; only the "?" listener ships with the shell.
const KeyboardShortcutsPanel = lazyWithRetry(() =>
  import('./KeyboardShortcutsPanel').then((m) => ({ default: m.KeyboardShortcutsPanel })),
);

/**
 * The "?" overlay. Mounted once at the app shell; keyboard-only, so it never
 * renders on native. AppDialog's Modal handles Escape and the return focus.
 *
 * Grouped by where each binding applies, because a flat list would promise keys
 * that do nothing on the screen the reader is looking at.
 */
export function KeyboardShortcutsDialog({ groups }: { groups: ShortcutGroupSpec[] }) {
  const visible = useShortcutsOverlayOpen();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      // NOTE: "?" still ignores the single-key switch below. The TopNav button is
      // the visible way in, but it only renders at >=lg, so on a narrower web
      // window "?" remains the only route back to the switch that turned the
      // shortcuts off. It opens a dialog rather than acting, so a stray press
      // costs an Escape. isPlainShortcut already ignores the press while a
      // dialog is open, so this opens but never toggles; Escape closes it.
      if (!isPlainShortcut(event, '?')) return;
      event.preventDefault();
      openShortcutsOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    // Unmounts on close, so the next open starts a fresh boundary and retries.
    <LazyBoundary onError={closeShortcutsOverlay}>
      <KeyboardShortcutsPanel groups={groups} />
    </LazyBoundary>
  );
}
