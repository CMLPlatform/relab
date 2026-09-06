// One-slot handoff from the category-selection screen, consumed on focus. A
// module slot, not a URL param: `/products/new` has no `[id]` to round-trip through.
// NOTE: single global slot — only one type selection is ever in flight.

let pendingTypeId: number | null = null;

export function setPendingTypeSelection(typeId: number): void {
  pendingTypeId = typeId;
}

/** Return the pending type id (if any) and clear it. */
// NOTE: module-global handoff; convert to route params if a second picker route ever appears.
export function takePendingTypeSelection(): number | null {
  const value = pendingTypeId;
  pendingTypeId = null;
  return value;
}
