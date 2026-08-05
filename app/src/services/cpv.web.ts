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
  }
  return cpvPromise;
}
