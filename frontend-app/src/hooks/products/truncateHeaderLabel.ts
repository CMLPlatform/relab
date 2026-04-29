export function truncateHeaderLabel(value: string | undefined, maxLength: number): string {
  if (!value) return 'Product';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
