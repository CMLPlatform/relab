// Runs before the test framework and before any setup module is required.
//
// MSW's cookie store reads `globalThis.localStorage` at import time. Node's
// built-in web storage is flag-gated (`--localstorage-file`), so merely touching
// the getter prints an ExperimentalWarning in every worker. An in-memory stub
// shadows it — and gives MSW a real place to keep cookies. `sessionStorage` gets
// the same treatment so code that persists per-session web state is testable.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  } as Storage;
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: memoryStorage(),
  });
}
