import { useEffect } from 'react';
import { Platform } from 'react-native';

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
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || imageCount <= 1) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && selectedIndex > 0) {
        onPrevious();
      } else if (event.key === 'ArrowRight' && selectedIndex < imageCount - 1) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, imageCount, onNext, onPrevious, selectedIndex]);
}
