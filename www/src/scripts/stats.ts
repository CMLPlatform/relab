// Client-side population of the homepage stats panel. Fetches the public stats
// API in the browser (same pattern as the app/docs frontends, permitted by the
// CADDY_API_ORIGIN entry in the CSP) and reveals the panel once data arrives.
// On any failure the panel is left hidden.

import { barPercent, fetchHomeStats, formatCount, formatMass } from '@/lib/stats.ts';

/** A right-aligned figure with a visually-hidden label so it reads in context. */
function buildMetric(className: string, value: number, srLabel: string): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = formatCount(value);

  const hidden = document.createElement('span');
  hidden.className = 'visually-hidden';
  hidden.textContent = ` ${srLabel}`;
  cell.appendChild(hidden);

  return cell;
}

function buildBar(name: string, teardowns: number, parts: number, max: number): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'stats-bar-row';

  const label = document.createElement('span');
  label.className = 'stats-bar-name';
  label.textContent = name;

  const track = document.createElement('span');
  track.className = 'stats-bar-track';
  track.setAttribute('aria-hidden', 'true');

  const fill = document.createElement('span');
  fill.className = 'stats-bar-fill';
  fill.style.width = `${barPercent(teardowns, max)}%`;
  track.appendChild(fill);

  const teardownCount = buildMetric(
    'stats-bar-count stats-bar-count-teardowns',
    teardowns,
    'torn down',
  );
  const partCount = buildMetric('stats-bar-count stats-bar-count-parts', parts, 'parts documented');

  row.append(label, track, teardownCount, partCount);
  return row;
}

export async function renderStats(): Promise<void> {
  const panel = document.getElementById('stats-panel');
  if (!panel) {
    return;
  }

  const stats = await fetchHomeStats();
  if (!stats) {
    return; // leave the panel hidden
  }

  const { totals, categories, generatedAt } = stats;
  const set = (key: string, value: string): void => {
    const target = panel.querySelector(`[data-stat="${key}"]`);
    if (target) {
      target.textContent = value;
    }
  };

  set('teardowns', formatCount(totals.teardowns));
  set('parts', formatCount(totals.parts));
  const mass = formatMass(totals.mass_kg);
  set('mass', mass.value);
  set('mass-unit', mass.unit);
  set('images', formatCount(totals.images));

  const bars = panel.querySelector('[data-stat="bars"]');
  if (bars && categories.length > 0) {
    const max = Math.max(...categories.map((category) => category.teardowns), 1);
    bars.replaceChildren(...categories.map((c) => buildBar(c.name, c.teardowns, c.parts, max)));
  } else {
    // No categories: drop the whole block so its heading doesn't dangle.
    bars?.closest('.stats-categories')?.remove();
  }

  const updated = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(generatedAt));
  set('caption', `Updated ${updated} · ${formatCount(totals.users)} contributors`);

  panel.classList.add('content-reveal');
  panel.hidden = false;
}
