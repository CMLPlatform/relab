/**
 * Ephemeral store for pre-filling a new product before navigation.
 *
 * Why: Passing structured data (name, brand, model, parentID) as Expo Router
 * params serializes everything to strings and silently breaks on refresh or
 * deep-link. Instead, the caller writes intent here, navigates to /products/new,
 * and the destination reads+clears it on mount.
 *
 * This is a plain module-level variable — it lives only for the current session,
 * is never persisted, and is intentionally not reactive.
 */

export type NewProductIntent = {
  name?: string;
  brand?: string;
  model?: string;
  /** Numeric parent product ID when creating a component */
  parentID?: number;
  isComponent?: boolean;
};

let _intent: NewProductIntent | null = null;

/** Write before navigating to /products/new */
export function setNewProductIntent(intent: NewProductIntent): void {
  _intent = intent;
}

/** Read once on mount in the product page; returns null if nothing was set */
export function consumeNewProductIntent(): NewProductIntent | null {
  const value = _intent;
  _intent = null;
  return value;
}
