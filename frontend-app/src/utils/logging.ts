export function logError(...args: unknown[]) {
  try {
    if (process.env.NODE_ENV === 'test') return;
  } catch {
    /* ignore */
  }
  console.error(...(args as [unknown, ...unknown[]]));
}

export default { logError };
