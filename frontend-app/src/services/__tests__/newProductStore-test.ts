import { describe, expect, it } from '@jest/globals';
import { consumeNewProductIntent, setNewProductIntent } from '../newProductStore';

describe('newProductStore', () => {
  it('consumeNewProductIntent returns null when nothing was set', () => {
    // Ensure clean state (no prior intent lingering from another test)
    consumeNewProductIntent();
    expect(consumeNewProductIntent()).toBeNull();
  });

  it('returns the intent set by setNewProductIntent', () => {
    setNewProductIntent({ name: 'Widget', brand: 'CircularTech' });
    const result = consumeNewProductIntent();
    expect(result).toEqual({ name: 'Widget', brand: 'CircularTech' });
  });

  it('clears the intent after consuming it', () => {
    setNewProductIntent({ name: 'One-shot' });
    consumeNewProductIntent(); // consume
    expect(consumeNewProductIntent()).toBeNull(); // already consumed
  });

  it('overwrites a previous intent with a new one', () => {
    setNewProductIntent({ name: 'First' });
    setNewProductIntent({ name: 'Second', parentID: 5 });
    const result = consumeNewProductIntent();
    expect(result?.name).toBe('Second');
    expect(result?.parentID).toBe(5);
  });
});
