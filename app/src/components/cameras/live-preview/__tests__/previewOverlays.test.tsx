import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { PreviewErrorOverlay } from '@/components/cameras/live-preview/previewOverlays';
import { renderWithProviders } from '@/test-utils/index';

describe('PreviewErrorOverlay', () => {
  it('exposes the retry action as a button to assistive tech', () => {
    const onRetry = jest.fn();
    renderWithProviders(<PreviewErrorOverlay message="Preview unavailable" onRetry={onRetry} />);

    const retry = screen.getByRole('button', { name: 'Tap to retry' });
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
