/**
 * A single module-level value plus the `subscribe`/`getSnapshot` pair
 * `useSyncExternalStore` wants. For state shared across sibling subtrees where a
 * provider would cost more than the value is worth; the calling module keeps the
 * hook and any persistence.
 */
export function createModuleStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: T) => {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
