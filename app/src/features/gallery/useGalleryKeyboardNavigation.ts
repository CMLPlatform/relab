import { useEffect, useEffectEvent } from 'react';
import { Platform } from 'react-native';

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Whether the key event originated inside a field the user is typing into. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target && typeof target === 'object' && 'tagName' in target)) return false;
  const element = target as HTMLElement;
  return TEXT_ENTRY_TAGS.has(element.tagName) || element.isContentEditable;
}

export function useGalleryKeyboardNavigation({
  enabled,
  imageCount,
  selectedIndex,
  onPrevious,
  onNext,
}: {
  enabled: boolean;
  imageCount: number;
  selectedIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Arrow keys move the caret inside a text field; don't also move the gallery.
    if (isTextEntryTarget(event.target)) return;

    if (event.key === 'ArrowLeft' && selectedIndex > 0) {
      onPrevious();
    } else if (event.key === 'ArrowRight' && selectedIndex < imageCount - 1) {
      onNext();
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || imageCount <= 1) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, imageCount]);
}
