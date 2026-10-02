import {
  type ComponentProps,
  type ComponentType,
  createElement,
  lazy,
  type ReactNode,
} from 'react';

/** A failed on-demand import, carrying the switch that lets the next mount fetch it again. */
export class ChunkLoadError extends Error {
  readonly retry: () => void;

  constructor(cause: unknown, retry: () => void) {
    super('Chunk failed to load', { cause });
    this.name = 'ChunkLoadError';
    this.retry = retry;
  }
}

/**
 * React.lazy that can try again. A plain lazy() caches a rejected import for the life of
 * the page, so one failed chunk (offline, or a deploy that replaced the hashed assets)
 * would fail every later open too. LazyBoundary swaps in a fresh lazy() once it has
 * caught the failure; swapping any earlier would hand React's own re-render a new
 * pending import instead of the rejection, and it would never settle.
 */
// biome-ignore lint/suspicious/noExplicitAny: mirrors React.lazy's own constraint.
export function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): (props: ComponentProps<T>) => ReactNode {
  const make = () =>
    lazy(() =>
      load().catch((error: unknown): never => {
        throw new ChunkLoadError(error, () => {
          current = make();
        });
      }),
    );
  let current = make();
  return function LazyWithRetry(props: ComponentProps<T>) {
    return createElement(current, props);
  };
}
