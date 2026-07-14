// Canonical home of formatWeight — do not re-export from SpecHeader.tsx (react-refresh/only-export-components).
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
  }
  return `${grams} g`;
}
