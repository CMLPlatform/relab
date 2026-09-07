import type { CPVCategory } from '@/types/CPVCategory';

type CPVMap = Record<string, CPVCategory>;

// NOTE: web-only fork of cpv.ts so the 2MB CPV dataset ships as its own async
// chunk. Keep the two files' exported surface identical.
let cpvPromise: Promise<CPVMap> | null = null;

export function loadCPV(): Promise<CPVMap> {
  if (!cpvPromise) {
    cpvPromise = import('@/assets/data/cpv.json').then((m) => (m.default ?? m) as CPVMap);
    // Never cache a rejection (a dropped chunk fetch or a mid-session deploy),
    // or the picker stays empty for the session.
    cpvPromise.catch(() => {
      cpvPromise = null;
    });
  }
  return cpvPromise;
}
