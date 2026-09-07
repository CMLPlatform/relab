// Canonical home of formatWeight — do not re-export from SpecHeader.tsx (react-refresh/only-export-components).
/** Grams, always: one unit per screen, matching Physical properties. */
export function formatWeight(grams: number): string {
  return `${grams} g`;
}
