/** Keep TOTP inputs to the six digits the backend accepts, whatever the keyboard sends. */
export function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
