// NOTE: happy-dom v20's localStorage getter reads `this[Symbol]`, but Vitest 4
// copies the getter onto globalThis where `this` no longer points at the Window,
// so window.localStorage reads back undefined. Install a plain in-memory Storage.
// Drop this once vitest/happy-dom fix the global binding.
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length() {
    return this.#map.size;
  }
  clear() {
    this.#map.clear();
  }
  getItem(key: string) {
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }
  key(index: number) {
    return [...this.#map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#map.delete(key);
  }
  setItem(key: string, value: string) {
    this.#map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
