import type { CPVCategory } from '@/types/CPVCategory';

type CPVMap = Record<string, CPVCategory>;

// Module-level single-flight promise. require() is deferred so the 2MB CPV
// dataset is not parsed until loadCPV() is awaited; `await import(...)` fails
// under Jest's CJS runtime.
//
// NOTE: web builds resolve cpv.web.ts instead, which code-splits via a real
// `import()`. Native and Jest resolve this file.
let cpvPromise: Promise<CPVMap> | null = null;

export function loadCPV(): Promise<CPVMap> {
  if (!cpvPromise) {
    cpvPromise = new Promise<CPVMap>((resolve) => {
      resolve(require('@/assets/data/cpv.json') as unknown as CPVMap);
    });
    // Never cache a rejection, or the picker stays empty for the session.
    cpvPromise.catch(() => {
      cpvPromise = null;
    });
  }
  return cpvPromise;
}
