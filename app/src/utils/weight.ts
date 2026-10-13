const kgFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** A total weight for display: whole grams below 1 kg ("164 g"), else kg to one decimal ("1.6 kg"). */
export function formatWeightKg(kg: number): string {
  const grams = Math.round(kg * 1000);
  return grams < 1000 ? `${grams} g` : `${kgFormat.format(grams / 1000)} kg`;
}
