import { describe, expect, it } from '@jest/globals';
import {
  setPendingTypeSelection,
  takePendingTypeSelection,
} from '@/features/products/pendingTypeSelection';

describe('pendingTypeSelection', () => {
  it('returns null when nothing is pending', () => {
    expect(takePendingTypeSelection()).toBeNull();
  });

  it('hands the selection over exactly once', () => {
    setPendingTypeSelection(42);

    expect(takePendingTypeSelection()).toBe(42);
    // The slot is a one-shot handoff: a second consumer must not see a stale id.
    expect(takePendingTypeSelection()).toBeNull();
  });

  it('keeps only the most recent selection', () => {
    setPendingTypeSelection(1);
    setPendingTypeSelection(2);

    expect(takePendingTypeSelection()).toBe(2);
  });
});
