import { createContext, type RefObject } from 'react';

/**
 * AmountChip keeps a typed-but-unblurred amount in local draft state (see
 * ProductTags.tsx) so a multi-digit edit doesn't commit digit-by-digit.
 * Blur-before-press ordering is convention, not a contract, in RN — pressing
 * Save can fire before the input blurs — so saveAndExit reads this ref
 * synchronously before serializing to flush any pending draft deterministically,
 * rather than relying on the input having already blurred.
 *
 * Returns the just-committed amount, or undefined if there was no pending draft.
 */
export type AmountDraftFlush = () => number | undefined;

export const AmountDraftFlushContext = createContext<RefObject<AmountDraftFlush | null> | null>(
  null,
);
