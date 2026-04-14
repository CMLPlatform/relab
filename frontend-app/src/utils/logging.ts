export function logError(...args: unknown[]) {
  try {
    if (process.env.NODE_ENV === 'test') return;
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.error(...(args as [unknown, ...unknown[]]));
}

export default { logError };
