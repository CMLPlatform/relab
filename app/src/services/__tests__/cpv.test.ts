import { describe, expect, it } from '@jest/globals';
import { loadCPV } from '@/services/cpv';

describe('CPV service', () => {
  it('loads CPV data successfully', async () => {
    const data = await loadCPV();
    expect(data).toBeDefined();
    // Check if it looks like a CPVMap
    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThan(0);
    expect(data[keys[0]]).toHaveProperty('id');
    expect(data[keys[0]]).toHaveProperty('description');
  });
});
