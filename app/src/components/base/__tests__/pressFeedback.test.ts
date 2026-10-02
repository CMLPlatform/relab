import { describe, expect, it } from '@jest/globals';
import { pressFill } from '@/components/base/pressFeedback';

describe('press feedback', () => {
  it('applies the fill only while pressed or hovered', () => {
    expect(pressFill({ pressed: false }, 'rgba(1,2,3,0.12)')).toBeNull();
    expect(pressFill({ pressed: true }, 'rgba(1,2,3,0.12)')).toEqual({
      backgroundColor: 'rgba(1,2,3,0.12)',
    });
    expect(pressFill({ pressed: false, hovered: true }, 'x')).toEqual({ backgroundColor: 'x' });
  });
});
