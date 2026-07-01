export function logError(...args: unknown[]) {
  if (process.env.NODE_ENV === 'test') return;
  console.error(...(args as [unknown, ...unknown[]]));
}
