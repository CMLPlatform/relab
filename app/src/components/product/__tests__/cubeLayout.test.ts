import { describe, expect, it } from '@jest/globals';
import { cubeLayout } from '@/components/product/cubeLayout';

const ISO = Math.tan(Math.PI / 6);
const FRAME_W = 190;
const FRAME_H = 150;

/** The projection's bounding box, in the same units cubeLayout returns. */
function box({ w, h, d, tx, ty }: ReturnType<typeof cubeLayout>) {
  return {
    across: w + d,
    down: h + ISO * (w + d),
    centreX: tx + (w + d) / 2,
    // The top face rises ISO*d above the local origin, the front face's bottom
    // corner drops ISO*w below its baseline.
    centreY: ty + (h + ISO * w - ISO * d) / 2,
  };
}

describe('cubeLayout', () => {
  it('preserves the relative proportions of the measured axes', () => {
    const { w, h, d } = cubeLayout(10, 5, 3);
    expect(w / h).toBeCloseTo(10 / 5);
    expect(w / d).toBeCloseTo(10 / 3);
  });

  // The old implementation subtracted a magic 50 from its height estimate and
  // ignored the top face's overhang, so a tall thin product rendered in the
  // bottom half of the canvas.
  it.each([
    ['cube', 10, 10, 10],
    ['tall and thin', 1, 40, 1],
    ['wide and flat', 40, 1, 30],
    ['unmeasured', undefined, undefined, undefined],
  ])('centres a %s product in the frame', (_label, width, height, depth) => {
    const { centreX, centreY } = box(cubeLayout(width, height, depth));
    expect(centreX).toBeCloseTo(FRAME_W / 2);
    expect(centreY).toBeCloseTo(FRAME_H / 2);
  });

  it.each([
    ['cube', 10, 10, 10],
    ['tall and thin', 1, 40, 1],
    ['wide and flat', 40, 1, 30],
  ])('fits a %s product inside the frame and fills one axis of it', (_l, width, height, depth) => {
    const { across, down } = box(cubeLayout(width, height, depth));
    expect(across).toBeLessThanOrEqual(FRAME_W + 1e-6);
    expect(down).toBeLessThanOrEqual(FRAME_H + 1e-6);
    // Fitted, not merely small: one axis has to touch the frame or the drawing
    // wastes the canvas the way the old fixed 90-unit normalisation did.
    const filled = across > FRAME_W - 1e-6 || down > FRAME_H - 1e-6;
    expect(filled).toBe(true);
  });

  it('floors a wafer-thin axis so its face stays visible', () => {
    // 0.4 of 40 is 1% — below the floor, so height is drawn at MIN_RATIO.
    const { w, h } = cubeLayout(40, 0.4, 30);
    expect(h / w).toBeCloseTo(0.06);
  });

  it('draws a cube when nothing is measured', () => {
    const { w, h, d } = cubeLayout(undefined, undefined, undefined);
    expect(w).toBeCloseTo(h);
    expect(h).toBeCloseTo(d);
  });

  it('stands an unmeasured axis in at the mean of the measured ones', () => {
    const { w, h, d } = cubeLayout(10, 20, undefined);
    expect(w / h).toBeCloseTo(10 / 20);
    expect(d / w).toBeCloseTo(15 / 10);
  });

  // Zero is the one invalid value the form can hand over, and it must not
  // collapse the scale or divide the fit by zero.
  it('treats zero as unmeasured', () => {
    expect(cubeLayout(0, 0, 0)).toEqual(cubeLayout(undefined, undefined, undefined));
  });
});
