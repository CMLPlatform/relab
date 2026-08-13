import { describe, expect, it } from '@jest/globals';
import { dehydrate, onlineManager, type Query, QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { shouldDehydrateQuery } from '@/services/persistedQueryCache';

// A minimal stand-in for a successful query — shouldDehydrateQuery only reads
// `queryKey` and (via defaultShouldDehydrateQuery) `state.status`.
function successfulQuery(queryKey: unknown[]): Query {
  return { queryKey, state: { status: 'success' } } as unknown as Query;
}

describe('shouldDehydrateQuery (persisted-cache allowlist)', () => {
  it('dehydrates an allowlisted products query', () => {
    expect(shouldDehydrateQuery(successfulQuery(['products', 'infinite', 'all', '']))).toBe(true);
  });

  it('dehydrates allowlisted product-detail and reference-data queries', () => {
    expect(shouldDehydrateQuery(successfulQuery(['baseProduct', 1]))).toBe(true);
    expect(shouldDehydrateQuery(successfulQuery(['component', 1]))).toBe(true);
    expect(shouldDehydrateQuery(successfulQuery(['brands', 'search', '']))).toBe(true);
    expect(shouldDehydrateQuery(successfulQuery(['productTypes', 'search', '']))).toBe(true);
  });

  it('does not dehydrate a camera/telemetry query', () => {
    expect(shouldDehydrateQuery(successfulQuery(['rpiCameras', true, true]))).toBe(false);
  });

  it('does not dehydrate a profile query', () => {
    expect(shouldDehydrateQuery(successfulQuery(['publicProfile', 'someone', null]))).toBe(false);
  });

  // Default-closed: a brand-new, not-yet-allowlisted query key must not persist.
  it('does not dehydrate an unknown query key', () => {
    expect(shouldDehydrateQuery(successfulQuery(['somethingNew', 1]))).toBe(false);
  });

  it('still defers to the default status check for an allowlisted key', () => {
    const pendingProductsQuery = {
      queryKey: ['products', 'infinite', 'all', ''],
      state: { status: 'pending' },
    } as unknown as Query;
    expect(shouldDehydrateQuery(pendingProductsQuery)).toBe(false);
  });
});

describe('paused mutations survive the query allowlist', () => {
  it('dehydrates a paused mutation even though shouldDehydrateQuery only allowlists queries', async () => {
    const queryClient = new QueryClient();
    act(() => onlineManager.setOnline(false));

    queryClient
      .getMutationCache()
      .build(
        queryClient,
        { mutationKey: ['saveProduct'], mutationFn: () => new Promise(() => {}) },
        undefined,
      )
      .execute({ idempotencyKey: 'test-idempotency-key' });

    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    });

    const dehydrated = dehydrate(queryClient, { shouldDehydrateQuery });

    expect(dehydrated.mutations).toHaveLength(1);
    expect(dehydrated.mutations[0]?.mutationKey).toEqual(['saveProduct']);
    // The key must survive dehydration in the variables themselves — a
    // rehydrated mutation re-attaches its mutationFn by mutationKey (functions
    // aren't serializable) but replays these same variables, so a key minted
    // inside the mutationFn instead of carried here would rotate on rehydrate.
    expect(dehydrated.mutations[0]?.state.variables).toMatchObject({
      idempotencyKey: 'test-idempotency-key',
    });

    act(() => onlineManager.setOnline(true));
  });
});
