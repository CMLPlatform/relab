/**
 * Guards shared by every web keyboard shortcut. Single-key bindings are only
 * safe because of these: without them "n" types an "n" into whatever field has
 * focus and navigates away instead.
 */

/** A field the keypress belongs to, so a shortcut must not steal it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    // contenteditable hosts and ARIA-only textboxes take text too, but carry
    // neither tag name.
    element.isContentEditable ||
    element.getAttribute?.('role') === 'textbox'
  );
}

/** An open dialog owns the keyboard; shortcuts behind the scrim stay inert. */
export function isDialogOpen(): boolean {
  // biome-ignore lint/security/noSecrets: an ARIA attribute selector, not a secret.
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * A bare letter/symbol press meant as a shortcut. Shift is allowed because "?"
 * needs it on most layouts; Cmd/Ctrl/Alt are not, so browser and OS bindings
 * keep working.
 */
export function isPlainShortcut(event: KeyboardEvent, key: string): boolean {
  if (event.key !== key) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !(isTypingTarget(event.target) || isDialogOpen());
}
