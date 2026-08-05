import type { CPVCategory } from '@/types/CPVCategory';

type CPVMap = Record<string, CPVCategory>;

// NOTE: module-level memo, single-flight promise — good enough for a
// singleton dataset loaded once per app session.
//
// require() is deferred inside the promise executor rather than statically
// imported at module scope, so the 2MB CPV dataset isn't parsed until a
// caller actually awaits loadCPV() — Metro's module cache still only runs
// the factory once. `await import(...)` was tried first but Jest's CJS
// runtime rejects real dynamic import without --experimental-vm-modules,
// and wiring that flag/plugin needs changes outside this file's ownership.
//
// NOTE: web builds use cpv.web.ts instead (Metro's platform resolution),
// which code-splits the dataset out of the main bundle via a real
// `import()`. Native and Jest resolve this file.
let cpvPromise: Promise<CPVMap> | null = null;

export function loadCPV(): Promise<CPVMap> {
  if (!cpvPromise) {
    cpvPromise = new Promise<CPVMap>((resolve) => {
      resolve(require('@/assets/data/cpv.json') as unknown as CPVMap);
    });
  }
  return cpvPromise;
}
