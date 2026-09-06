import { createContext, type RefObject } from 'react';

/**
 * AmountChip keeps a typed-but-unblurred amount in draft state (ProductTags.tsx).
 * In RN, Save can fire before the input blurs, so saveAndExit calls this
 * synchronously to flush any pending draft.
 *
 * Returns the just-committed amount, or undefined if there was no pending draft.
 */
export type AmountDraftFlush = () => number | undefined;

export const AmountDraftFlushContext = createContext<RefObject<AmountDraftFlush | null> | null>(
  null,
);
