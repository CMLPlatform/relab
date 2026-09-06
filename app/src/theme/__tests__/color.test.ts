import { describe, expect, it } from '@jest/globals';
import { alpha, getStatusColor, getStatusTone } from '@/theme/color';
import type { AppTheme } from '@/theme/types';

const theme = {
  tokens: {
    status: {
      success: '#00ff00',
      offline: '#888888',
      warning: '#ffaa00',
      danger: '#ff0000',
    },
  },
} as unknown as AppTheme;

describe('alpha', () => {
  it('adds an alpha channel to rgb()', () => {
    expect(alpha('rgb(1, 2, 3)', 0.5)).toBe('rgba(1, 2, 3, 0.5)');
  });

  // Re-tinting an already-tinted colour must replace the alpha, not append a
  // fifth component and produce an unparseable string.
  it('replaces the existing alpha on rgba()', () => {
    expect(alpha('rgba(1, 2, 3, 0.8)', 0.2)).toBe('rgba(1, 2, 3, 0.2)');
  });

  it('expands 3-digit hex before converting', () => {
    expect(alpha('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)');
  });

  it('converts 6-digit hex', () => {
    expect(alpha('#ff8000', 0.25)).toBe('rgba(255, 128, 0, 0.25)');
  });

  it('drops the alpha pair from an 8-digit hex rather than misreading it', () => {
    expect(alpha('#ff800080', 0.25)).toBe('rgba(255, 128, 0, 0.25)');
  });

  // Named colours and CSS variables flow through unchanged; returning a mangled
  // string here would paint an invisible or black surface.
  it('passes through anything it cannot parse', () => {
    expect(alpha('transparent', 0.5)).toBe('transparent');
    expect(alpha('var(--brand)', 0.5)).toBe('var(--brand)');
  });
});

describe('getStatusColor', () => {
  it('maps each known status to its token', () => {
    expect(getStatusColor(theme, 'online')).toBe('#00ff00');
    expect(getStatusColor(theme, 'offline')).toBe('#888888');
    expect(getStatusColor(theme, 'unauthorized')).toBe('#ffaa00');
    expect(getStatusColor(theme, 'forbidden')).toBe('#ffaa00');
    expect(getStatusColor(theme, 'error')).toBe('#ff0000');
  });

  // A status the backend adds before the client's types catch up would otherwise
  // return undefined and crash alpha() downstream.
  it('falls back to the offline token for an unknown status', () => {
    expect(getStatusColor(theme, 'brand-new-status' as never)).toBe('#888888');
  });
});

describe('getStatusTone', () => {
  it('tints at 12% by default', () => {
    expect(getStatusTone('#ff0000')).toBe('rgba(255, 0, 0, 0.12)');
  });

  it('accepts an explicit opacity', () => {
    expect(getStatusTone('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });
});
