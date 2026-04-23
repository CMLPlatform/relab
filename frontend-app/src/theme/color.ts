const RGBA_ALPHA_PATTERN = /rgba\((.+),\s*[^,]+\)$/;

export function alpha(color: string, opacity: number) {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  if (color.startsWith('rgba(')) {
    return color.replace(RGBA_ALPHA_PATTERN, `rgba($1, ${opacity})`);
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : hex.slice(0, 6);
    const int = Number.parseInt(normalized, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}
