import { describe, expect, it } from '@jest/globals';
import { darkTheme, getAppTheme, getStatusColor, lightTheme } from '@/theme';

describe('theme', () => {
  it('returns stable light and dark app themes', () => {
    expect(getAppTheme('light')).toBe(lightTheme);
    expect(getAppTheme('dark')).toBe(darkTheme);
    expect(lightTheme.scheme).toBe('light');
    expect(darkTheme.scheme).toBe('dark');
  });

  it('provides semantic tokens for overlays, borders, text, and surfaces', () => {
    expect(lightTheme.tokens.overlay.page).toBeDefined();
    expect(lightTheme.tokens.border.selected).toBeDefined();
    expect(lightTheme.tokens.text.link).toBeDefined();
    expect(darkTheme.tokens.surface.sunken).toBeDefined();
  });

  it('maps connection statuses to semantic status colors', () => {
    expect(getStatusColor(lightTheme, 'online')).toBe(lightTheme.tokens.status.success);
    expect(getStatusColor(lightTheme, 'offline')).toBe(lightTheme.tokens.status.offline);
    expect(getStatusColor(lightTheme, 'unauthorized')).toBe(lightTheme.tokens.status.warning);
    expect(getStatusColor(lightTheme, 'error')).toBe(lightTheme.tokens.status.danger);
  });
});
