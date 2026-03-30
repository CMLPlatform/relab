import cpvData from '@/assets/data/cpv.json';
import type { CPVCategory } from '@/types/CPVCategory';

type CPVMap = Record<string, CPVCategory>;

export async function loadCPV(): Promise<CPVMap> {
  return cpvData as unknown as CPVMap;
}

export function resetCPVCacheForTests(): void {
  // No-op after switching to static import
}
