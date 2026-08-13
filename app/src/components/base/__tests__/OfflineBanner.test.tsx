import { describe, expect, it } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { OfflineBanner } from '@/components/base/OfflineBanner';
import { renderWithProviders } from '@/test-utils/render';

const OFFLINE_TEXT = /offline/i;

describe('OfflineBanner', () => {
  afterEach(() => {
    act(() => onlineManager.setOnline(true));
  });

  it('renders nothing while online', () => {
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });

  it('shows a polite live-region message when offline', () => {
    renderWithProviders(<OfflineBanner />);
    act(() => onlineManager.setOnline(false));
    const message = screen.getByText(OFFLINE_TEXT);
    expect(message).toBeOnTheScreen();
    expect(message.props.accessibilityLiveRegion).toBe('polite');
  });

  it('hides again once back online', () => {
    renderWithProviders(<OfflineBanner />);
    act(() => onlineManager.setOnline(false));
    expect(screen.getByText(OFFLINE_TEXT)).toBeOnTheScreen();
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });
});
