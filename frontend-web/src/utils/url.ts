export function joinApiUrl(baseUrl: string, path: string): string {
  if (!baseUrl) throw new Error(`joinApiUrl: baseUrl is ${baseUrl}; is PUBLIC_API_URL set?`);
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
