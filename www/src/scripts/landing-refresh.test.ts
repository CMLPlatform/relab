// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { applyRefresh } from './landing-refresh.ts';

describe('applyRefresh', () => {
  it('updates the metrics line in place', () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    applyRefresh({ totals: { teardowns: 50, parts: 1700, mass_kg: 355, images: 4000, users: 12 } });
    expect(document.querySelector('[data-metrics]')?.textContent).toContain('50');
  });

  it('does nothing when the metrics node is absent', () => {
    document.body.innerHTML = '<p>no hook</p>';
    expect(() =>
      applyRefresh({ totals: { teardowns: 1, parts: 1, mass_kg: 1, images: 1, users: 1 } }),
    ).not.toThrow();
  });

  it('does nothing when given null', () => {
    document.body.innerHTML = '<p data-metrics>old</p>';
    applyRefresh(null);
    expect(document.querySelector('[data-metrics]')?.textContent).toBe('old');
  });
});
