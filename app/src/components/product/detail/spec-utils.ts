// Canonical home of formatWeight — do not re-export from SpecHeader.tsx (react-refresh/only-export-components).
/**
 * Grams, always: the field is entered and stored in grams and Physical
 * properties prints it that way, so the spec header a few lines above must
 * not print the same record as "1.2 kg". One unit per screen.
 */
export function formatWeight(grams: number): string {
  return `${grams} g`;
}
