// Drift guard: every hex colour baked into a docs architecture mermaid diagram
// must come from the shared chart palette in assets/tokens.json, or be one of
// the documented non-palette sentinels below. Catches someone hand-picking a
// one-off colour instead of reusing the palette the next time a diagram is
// edited. The www-side method-flow.mmd sources have their own copy of this
// guard in www/src/scripts/diagram-palette.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// assets/tokens.json lives above the docs package, out of reach of any '@/'
// alias, so read it by path like the diagram sources below.
const tokens = JSON.parse(readFileSync(join(__dirname, '../../../assets/tokens.json'), 'utf8')) as {
  chart: Record<string, Record<string, string>>;
};

const CHART_HEXES = new Set(
  Object.values(tokens.chart).flatMap((hue) => Object.values(hue).map((v) => v.toLowerCase())),
);

// Documented exceptions, not palette members:
// - the brightened chart-mark pair from assets/DESIGN.md's data-viz band.
const ALLOWED = new Set(['#1f4c96', '#172637', '#98adc7', '#fefefe', '#2f6bc7', '#6fa8ff']);

// Only mermaid config/classDef lines carry colour; scoping to those avoids
// false positives from unrelated hexes that might land elsewhere in a doc.
const DIAGRAM_COLOUR_LINE =
  /^\s*(?:classDef|primaryColor|primaryBorderColor|primaryTextColor|lineColor|edgeLabelBackground|clusterBkg|clusterBorder|style)\b.*$/gm;
const HEX_PATTERN = /#[0-9a-fA-F]{6}/g;

function hexesIn(source: string): string[] {
  const lines = source.match(DIAGRAM_COLOUR_LINE) ?? [];
  return lines.flatMap((line) => line.match(HEX_PATTERN) ?? []).map((h) => h.toLowerCase());
}

function offendersIn(sources: string[]): string[] {
  const offenders = sources
    .flatMap(hexesIn)
    .filter((hex) => !(CHART_HEXES.has(hex) || ALLOWED.has(hex)));
  return [...new Set(offenders)];
}

describe('diagram hexes come from the shared chart palette', () => {
  it('docs architecture mdx', () => {
    const docsDir = join(__dirname, '../content/docs/architecture');
    const sources = readdirSync(docsDir)
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => readFileSync(join(docsDir, f), 'utf8'));
    expect(offendersIn(sources)).toEqual([]);
  });
});
