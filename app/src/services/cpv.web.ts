import type { CPVCategory } from '@/types/CPVCategory';

type CPVMap = Record<string, CPVCategory>;

// NOTE: web-only fork of cpv.ts. Metro resolves this file for web builds so
// the 2MB CPV dataset ships as its own async chunk instead of the main
// bundle; native/Jest keep cpv.ts's deferred require(). Keep the two files'
// exported surface identical.
let cpvPromise: Promise<CPVMap> | null = null;

export function loadCPV(): Promise<CPVMap> {
  if (!cpvPromise) {
    cpvPromise = import('@/assets/data/cpv.json').then((m) => (m.default ?? m) as CPVMap);
    // Never cache a rejection: the memo is assigned before the load resolves, so
    // without this one failure would be returned to every later caller for the
    // rest of the session and the product-type picker would stay silently empty.
    // On web the dataset is a real code-split chunk fetch, so a dropped
    // connection or a mid-session deploy is enough to trigger it.
    cpvPromise.catch(() => {
      cpvPromise = null;
    });
  }
  return cpvPromise;
}
