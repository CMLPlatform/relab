// One-slot handoff for the category-selection screen: it stores the picked
// product-type id and pops back, and the product/component detail screen
// consumes it on focus. A module slot rather than a URL param, so the picker can
// return to *any* route — an unsaved draft (`/products/new`) has no `[id]`
// segment to round-trip a param through. Mirrors the pendingMfaLogin handoff.
// NOTE: single global slot — only one type selection is ever in flight.

let pendingTypeId: number | null = null;

export function setPendingTypeSelection(typeId: number): void {
  pendingTypeId = typeId;
}

/** Return the pending type id (if any) and clear it. */
export function takePendingTypeSelection(): number | null {
  const value = pendingTypeId;
  pendingTypeId = null;
  return value;
}
