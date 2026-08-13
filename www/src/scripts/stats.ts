// Client-side population of the homepage stats panel. Fetches the public stats
// API in the browser (same pattern as the app/docs frontends, permitted by the
// CADDY_API_ORIGIN entry in the CSP) and reveals the panel once data arrives.
// On any failure the panel is left hidden.

import {
  buildScale,
  fetchHomeStats,
  formatCount,
  formatMass,
  type HomeStats,
  SERIES_MONTHS,
  type SeriesPoint,
} from '@/lib/stats.ts';

type MeasureKey = 'parts' | 'teardowns' | 'mass_kg' | 'images';

interface Measure {
  key: MeasureKey;
  label: string;
  /** Reads after "N ..." in the chart's accessible summary. */
  noun: string;
  fractional?: boolean;
}

const MEASURES: Measure[] = [
  { key: 'parts', label: 'Parts', noun: 'components documented' },
  { key: 'teardowns', label: 'Teardowns', noun: 'products disassembled' },
  { key: 'mass_kg', label: 'Mass', noun: 'logged', fractional: true },
  { key: 'images', label: 'Photos', noun: 'catalogued' },
];

// SVG coordinate system; the element scales fluidly via viewBox.
const W = 720;
const H = 240;
const PAD = { top: 22, right: 12, bottom: 34, left: 54 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const MAX_BAR_W = 24; // marks stay thin; the band's leftover is air
const BAR_RADIUS = 4;

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** "2026-07" -> "Jul". Parsed as UTC so the label never slips a month. */
function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/**
 * Axis unit and formatters for a measure, chosen once from the axis maximum.
 * Picking per tick would mix kg and t down a single axis.
 *
 * `format` rounds hard enough for clean tick labels; `formatValue` keeps the
 * precision a specific bar needs, so a 1.95 t month is never labelled "2t"
 * while sitting below the 2 t gridline.
 */
function axisScale(
  measure: Measure,
  yMax: number,
): { unit: string; format: (v: number) => string; formatValue: (v: number) => string } {
  if (measure.key !== 'mass_kg') {
    return { unit: '', format: formatCount, formatValue: formatCount };
  }
  const digits = (max: number) => (v: number) =>
    v.toLocaleString('en-US', { maximumFractionDigits: max });
  if (yMax >= 1000) {
    return {
      unit: 't',
      format: (v) => digits(1)(v / 1000),
      formatValue: (v) => digits(2)(v / 1000),
    };
  }
  return { unit: 'kg', format: digits(1), formatValue: digits(1) };
}

/** A bar with a rounded data-end and square corners at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(BAR_RADIUS, w / 2, h);
  return (
    `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
    `L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
  );
}

function statTile(label: string, value: string, unit = ''): HTMLDivElement {
  const tile = document.createElement('div');
  tile.className = 'stats-tile';

  const valueEl = document.createElement('span');
  valueEl.className = 'stats-tile-value';
  valueEl.textContent = value;
  if (unit) {
    const unitEl = document.createElement('span');
    unitEl.className = 'stats-unit';
    unitEl.textContent = unit;
    valueEl.appendChild(unitEl);
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'stats-label';
  labelEl.textContent = label;

  tile.append(valueEl, labelEl);
  return tile;
}

/** Visually-hidden twin of the chart, so no value is reachable only by hover. */
function buildTable(
  series: SeriesPoint[],
  measure: Measure,
  format: (v: number) => string,
  unit: string,
): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'visually-hidden';

  const caption = document.createElement('caption');
  caption.textContent = `${measure.label} per month, last ${SERIES_MONTHS} months`;

  const head = document.createElement('tr');
  for (const text of ['Month', unit ? `${measure.label} (${unit})` : measure.label]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    head.appendChild(th);
  }

  const body = document.createElement('tbody');
  for (const point of series) {
    const row = document.createElement('tr');
    const key = document.createElement('th');
    key.scope = 'row';
    key.textContent = point.period;
    const cell = document.createElement('td');
    cell.textContent = format(point[measure.key]);
    row.append(key, cell);
    body.appendChild(row);
  }

  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.append(caption, thead, body);
  return table;
}

/** Chart geometry shared by the layer builders below. */
interface Geom {
  x: (i: number) => number;
  y: (v: number) => number;
  colW: number;
  unit: string;
  formatValue: (v: number) => string;
}

/** Gridlines + y-axis ticks: solid hairlines, one shade off the surface. */
function buildGrid(ticks: number[], y: Geom['y'], format: (v: number) => string): SVGGElement {
  const grid = svg('g', { class: 'stats-chart-grid' });
  for (const tick of ticks) {
    grid.appendChild(svg('line', { x1: PAD.left, x2: W - PAD.right, y1: y(tick), y2: y(tick) }));
    grid.appendChild(
      svg(
        'text',
        { x: PAD.left - 8, y: y(tick), dy: '0.32em', 'text-anchor': 'end' },
        format(tick),
      ),
    );
  }
  return grid;
}

function buildBars(series: SeriesPoint[], measure: Measure, geom: Geom): SVGGElement {
  const { x, y, colW, unit, formatValue } = geom;
  const barW = Math.min(MAX_BAR_W, colW * 0.6);
  const values = series.map((point) => point[measure.key]);
  const peak = values.indexOf(Math.max(...values));

  const bars = svg('g', { class: 'stats-chart-bars' });
  series.forEach((point, i) => {
    const value = point[measure.key];
    const height = PAD.top + INNER_H - y(value);
    if (height > 0) {
      const bar = svg('path', {
        class: 'stats-chart-bar',
        d: barPath(x(i) - barW / 2, y(value), barW, height),
      });
      bar.style.setProperty('--bar-i', String(i));
      bars.appendChild(bar);
    }
    // Label from the right so the most recent month always carries a tick.
    if ((series.length - 1 - i) % 2 === 0) {
      bars.appendChild(
        svg(
          'text',
          { class: 'stats-chart-xlabel', x: x(i), y: H - PAD.bottom + 18, 'text-anchor': 'middle' },
          monthLabel(point.period),
        ),
      );
    }
    // Direct-label the extreme only; the axis and tooltip carry the rest.
    if (i === peak && value > 0) {
      bars.appendChild(
        svg(
          'text',
          { class: 'stats-chart-peak', x: x(i), y: y(value) - 8, 'text-anchor': 'middle' },
          `${formatValue(value)}${unit}`,
        ),
      );
    }
  });
  return bars;
}

/** Static crosshair and tooltip nodes; `show` positions them per column. */
function buildTipNodes() {
  const crosshairLayer = svg('g', { class: 'stats-chart-crosshair' });
  const crosshair = svg('line', { y1: PAD.top, y2: PAD.top + INNER_H });
  crosshairLayer.appendChild(crosshair);

  // `hidden` is an HTML attribute and does nothing on SVG elements, so
  // visibility is driven by a class both layers share.
  const tip = svg('g', { class: 'stats-chart-tip' });
  const dot = svg('circle', { r: 4 });
  const box = svg('rect', { x: -58, y: -30, width: 116, height: 34, rx: 6 });
  const tipLabel = svg('text', {
    x: 0,
    y: -18,
    'text-anchor': 'middle',
    class: 'stats-chart-tip-label',
  });
  const tipValue = svg('text', {
    x: 0,
    y: -5,
    'text-anchor': 'middle',
    class: 'stats-chart-tip-value',
  });
  const tipGroup = svg('g');
  tipGroup.append(box, tipLabel, tipValue);
  tip.append(dot, tipGroup);

  return { crosshairLayer, crosshair, tip, tipGroup, dot, tipLabel, tipValue };
}

/**
 * Crosshair + tooltip + hit targets, wired to pointer and keyboard. Root
 * listeners live here too; the caller only decides z-order via the returned
 * groups (crosshair behind the bars, tip and hits in front).
 */
function buildTooltip(
  root: SVGSVGElement,
  series: SeriesPoint[],
  measure: Measure,
  geom: Geom,
): { crosshairLayer: SVGGElement; tip: SVGGElement; hits: SVGGElement } {
  const { x, y, colW, unit, formatValue } = geom;
  const { crosshairLayer, crosshair, tip, tipGroup, dot, tipLabel, tipValue } = buildTipNodes();

  let active: number | null = null;
  const show = (i: number | null): void => {
    active = i;
    for (const layer of [tip, crosshairLayer]) {
      layer.classList.toggle('is-visible', i !== null);
    }
    if (i === null) {
      return;
    }
    const value = series[i][measure.key];
    const cx = x(i);
    const cy = y(value);
    crosshair.setAttribute('x1', String(cx));
    crosshair.setAttribute('x2', String(cx));
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    tipLabel.textContent = monthLabel(series[i].period);
    tipValue.textContent = `${formatValue(value)}${unit}`;
    // Clamp so the box never escapes the plot on the first/last column.
    const tx = Math.min(Math.max(cx, PAD.left + 58), W - PAD.right - 58);
    tipGroup.setAttribute('transform', `translate(${tx}, ${Math.max(cy - 12, PAD.top + 34)})`);
  };

  // Hit targets span the full column, so they clear the 24px minimum even
  // where the bar itself is a sliver.
  const hits = svg('g', { class: 'stats-chart-hits' });
  series.forEach((_, i) => {
    const hit = svg('rect', { x: PAD.left + i * colW, y: PAD.top, width: colW, height: INNER_H });
    hit.addEventListener('mouseenter', () => show(i));
    hits.appendChild(hit);
  });

  root.addEventListener('mouseleave', () => show(null));
  root.addEventListener('blur', () => show(null));
  root.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      if (event.key === 'Escape') {
        show(null);
      }
      return;
    }
    event.preventDefault();
    const next = active === null ? 0 : active + step;
    show(Math.min(Math.max(next, 0), series.length - 1));
  });

  return { crosshairLayer, tip, hits };
}

function buildChart(series: SeriesPoint[], measure: Measure): SVGSVGElement {
  const values = series.map((point) => point[measure.key]);
  const { yMax, ticks } = buildScale(Math.max(1, ...values), !measure.fractional);
  const { unit, format, formatValue } = axisScale(measure, yMax);

  const colW = INNER_W / series.length;
  const geom: Geom = {
    x: (i) => PAD.left + (i + 0.5) * colW,
    y: (v) => PAD.top + INNER_H - (v / yMax) * INNER_H,
    colW,
    unit,
    formatValue,
  };

  const total = values.reduce((sum, v) => sum + v, 0);
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    role: 'img',
    tabindex: '0',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-label':
      `${measure.label} per month (${measure.noun}): ${formatValue(total)}${unit} across the last ` +
      `${series.length} months, ${monthLabel(series[0].period)} to ` +
      `${monthLabel(series[series.length - 1].period)}. Full figures are in the table below.`,
  });

  const { crosshairLayer, tip, hits } = buildTooltip(root, series, measure, geom);
  root.append(
    buildGrid(ticks, geom.y, format),
    crosshairLayer,
    buildBars(series, measure, geom),
    tip,
    hits,
  );
  return root;
}

/** Wire the measure toggle to the chart and its table twin. */
function mountActivity(panel: HTMLElement, series: SeriesPoint[]): void {
  const chartSlot = panel.querySelector('[data-stat="chart"]');
  const tableSlot = panel.querySelector('[data-stat="table"]');
  const controls = panel.querySelector('[data-stat="controls"]');
  const heading = panel.querySelector('[data-stat="chart-heading"]');

  if (!(chartSlot && tableSlot && controls && heading) || series.length === 0) {
    // Nothing to plot: drop the block so its heading doesn't dangle.
    chartSlot?.closest('.stats-activity')?.remove();
    return;
  }

  let current: MeasureKey = 'parts';
  let drawn = false;

  const draw = (): void => {
    const measure = MEASURES.find((m) => m.key === current) ?? MEASURES[0];
    const values = series.map((point) => point[measure.key]);
    const { yMax } = buildScale(Math.max(1, ...values), !measure.fractional);
    const { unit, formatValue } = axisScale(measure, yMax);
    heading.textContent = unit
      ? `${measure.label} per month (${unit}) · last ${SERIES_MONTHS} months`
      : `${measure.label} per month · last ${SERIES_MONTHS} months`;
    chartSlot.replaceChildren(buildChart(series, measure));
    // The bar entrance is a first-impression device. Replacing the bars re-runs
    // it, so a measure toggle would make you wait out the stagger before the
    // comparison you clicked for is readable — gate it to the first draw.
    chartSlot.classList.toggle('stats-chart-enter', !drawn);
    drawn = true;
    tableSlot.replaceChildren(buildTable(series, measure, formatValue, unit));
    for (const button of controls.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.measure === current));
    }
  };

  controls.replaceChildren(
    ...MEASURES.map((measure) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stats-toggle';
      button.dataset.measure = measure.key;
      button.textContent = measure.label;
      button.addEventListener('click', () => {
        current = measure.key;
        draw();
      });
      return button;
    }),
  );
  draw();
}

function renderPanel(panel: HTMLElement, stats: HomeStats): void {
  const { totals, series, generatedAt } = stats;

  const hero = panel.querySelector('[data-stat="hero"]');
  if (hero) {
    hero.textContent = formatCount(totals.parts);
  }

  const tiles = panel.querySelector('[data-stat="tiles"]');
  const mass = formatMass(totals.mass_kg);
  tiles?.replaceChildren(
    statTile('teardowns', formatCount(totals.teardowns)),
    statTile('mass logged', mass.value, mass.unit),
    statTile('photos', formatCount(totals.images)),
  );

  mountActivity(panel, series);

  const updated = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(generatedAt));
  const caption = panel.querySelector('[data-stat="caption"]');
  if (caption) {
    caption.textContent = `Updated ${updated} · ${formatCount(totals.users)} contributors`;
  }
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

  renderPanel(panel, stats);
  panel.hidden = false;
}
