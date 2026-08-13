// Drift guard: every hex colour baked into a mermaid diagram (docs architecture
// mdx and the method-flow .mmd sources) must come from the shared chart palette
// in assets/tokens.json, or be one of the documented non-palette sentinels
// below. Catches someone hand-picking a one-off colour instead of reusing the
// palette the next time a diagram is edited.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// assets/tokens.json lives above the www package, out of reach of the '@/'
// alias (which only covers www/src), so read it by path like the diagram
// sources below, not via a parent-relative import specifier.
const tokens = JSON.parse(readFileSync(join(__dirname, '../../../assets/tokens.json'), 'utf8')) as {
  chart: Record<string, Record<string, string>>;
};

const CHART_HEXES = new Set(
  Object.values(tokens.chart).flatMap((hue) => Object.values(hue).map((v) => v.toLowerCase())),
);

// Documented exceptions, not palette members:
// - method-flow.mmd:6-13 post-processing sentinels (swapped for CSS vars when
//   the SVG is regenerated; asserted directly in MethodSteps.test.ts).
// - the brightened chart-mark pair from assets/DESIGN.md's data-viz band.
const ALLOWED = new Set(['#1f4c96', '#172637', '#98adc7', '#fefefe', '#2f6bc7', '#6fa8ff']);

// Only mermaid config/classDef lines carry colour; scoping to those avoids
// false positives from unrelated hexes that might land elsewhere in a doc.
const DIAGRAM_COLOUR_LINE =
  /^\s*(?:classDef|primaryColor|primaryBorderColor|primaryTextColor|lineColor|edgeLabelBackground|clusterBkg|clusterBorder|style)\b.*$/gm;
const HEX_PATTERN = /#[0-9a-fA-F]{6}/g;
const METHOD_FLOW_MMD = /^method-flow.*\.mmd$/;

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
    const docsDir = join(__dirname, '../../../docs/src/content/docs/architecture');
    const sources = readdirSync(docsDir)
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => readFileSync(join(docsDir, f), 'utf8'));
    expect(offendersIn(sources)).toEqual([]);
  });

  it('www method-flow mermaid sources', () => {
    const assetsDir = join(__dirname, '../assets');
    const sources = readdirSync(assetsDir)
      .filter((f) => METHOD_FLOW_MMD.test(f))
      .map((f) => readFileSync(join(assetsDir, f), 'utf8'));
    expect(offendersIn(sources)).toEqual([]);
  });
});
