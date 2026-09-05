import { Platform } from 'react-native';

// Split from SVGCube.tsx: react-refresh/only-export-components forbids exporting
// non-components alongside a component (see theme/appThemeContext.ts for the same
// pattern). Keeping the projection maths here also makes it testable on its own.

/** tan(30°) — the single source of truth for the projection angle. */
export const ISO = Math.tan(Math.PI / 6);

/** The frame the projection is fitted into, in viewBox units. */
export const FRAME_W = 190;
export const FRAME_H = 150;

/** Floor on the shortest axis, so a wafer-thin product still shows a face. */
const MIN_RATIO = 0.06;

export function isMeasured(value: number | undefined): value is number {
  return value !== undefined && value > 0;
}

export type CubeLayout = {
  /** Scaled axis lengths, in viewBox units. */
  w: number;
  h: number;
  d: number;
  /** Group translation that centres the projection in the frame. */
  tx: number;
  ty: number;
};

/**
 * Projects three measurements onto the fixed frame.
 *
 * Both bounding-box terms are linear in the axis ratios, so a shape interpolated
 * between two fitted shapes is itself fitted — which is what lets the viewBox
 * stay constant while the geometry animates between them.
 */
export function cubeLayout(
  width: number | undefined,
  height: number | undefined,
  depth: number | undefined,
): CubeLayout {
  const measured = [width, height, depth].filter(isMeasured);
  // An unmeasured axis has no honest length, so it borrows the mean of the ones
  // we do have (a bare unit when none are). The faces it touches are drawn
  // dashed, so the shape stays plausible without claiming a missing measurement.
  const standIn = measured.length
    ? measured.reduce((sum, value) => sum + value, 0) / measured.length
    : 1;
  const rawW = isMeasured(width) ? width : standIn;
  const rawH = isMeasured(height) ? height : standIn;
  const rawD = isMeasured(depth) ? depth : standIn;

  const largest = Math.max(rawW, rawH, rawD);
  const ratioW = Math.max(rawW / largest, MIN_RATIO);
  const ratioH = Math.max(rawH / largest, MIN_RATIO);
  const ratioD = Math.max(rawD / largest, MIN_RATIO);

  // The projection spans (w + d) across and h + ISO*(w + d) down.
  const span = ratioW + ratioD;
  const scale = Math.min(FRAME_W / span, FRAME_H / (ratioH + ISO * span));

  const w = ratioW * scale;
  const h = ratioH * scale;
  const d = ratioD * scale;

  return {
    w,
    h,
    d,
    tx: (FRAME_W - (w + d)) / 2,
    // The top face rises ISO*d above the shape's own origin.
    ty: (FRAME_H - (h + ISO * (w + d))) / 2 + ISO * d,
  };
}

export type Matrix = [number, number, number, number, number, number];

// react-native-svg takes a column-major matrix under two different prop names:
// the native views declare `matrix` (see fabric/GroupNativeComponent), while
// the web renderer only understands `transform` (web/utils/prepare has no
// `matrix` branch and would emit an invalid attribute). Normally the JS layer
// converts `transform` to `matrix` for native, but Reanimated's animated-prop
// path writes the keys verbatim and skips that conversion — so the key has to
// match the platform.
// NOTE: on-device verification of the native path is still pending.
const IS_WEB = Platform.OS === 'web';

// Typed as `transform` because that is the public prop; react-native-svg only
// declares `matrix` on its internal extracted-props type, so the native branch
// needs the cast.
export function matrixProp(m: Matrix): { transform: Matrix } {
  'worklet';
  return (IS_WEB ? { transform: m } : { matrix: m }) as { transform: Matrix };
}
