import { useEffect, useEffectEvent } from 'react';
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
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
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
