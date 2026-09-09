import { Platform } from 'react-native';

// Split from SVGCube.tsx (react-refresh/only-export-components).

/** tan(30°): the single source of truth for the projection angle. */
export const ISO = Math.tan(Math.PI / 6);

/** The frame the projection is fitted into, in viewBox units. */
export const FRAME_W = 190;
export const FRAME_H = 150;

// NOTE: SVG-drawn label; the ramp does not reach SVG props.
export const FONT_SIZE = 12;
export const LABEL_GAP = 15;
/** Widest label the left gutter must hold ("123.45 cm"), at ~0.6em per glyph. */
export const MAX_LABEL_WIDTH = Math.ceil('123.45 cm'.length * FONT_SIZE * 0.6);

// Fixed viewBox (an animated viewBox is poorly supported); the padding leaves
// room for the edge labels outside the shape.
const PAD_LEFT = LABEL_GAP + MAX_LABEL_WIDTH;
const PAD_RIGHT = 40;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
export const VIEW_BOX = [
  -PAD_LEFT,
  -PAD_TOP,
  FRAME_W + PAD_LEFT + PAD_RIGHT,
  FRAME_H + PAD_TOP + PAD_BOTTOM,
].join(' ');

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
 * Projects three measurements onto the fixed frame. Both bounding-box terms
 * are linear in the axis ratios, so interpolated shapes stay fitted and the
 * viewBox can stay constant.
 */
export function cubeLayout(
  width: number | undefined,
  height: number | undefined,
  depth: number | undefined,
): CubeLayout {
  const measured = [width, height, depth].filter(isMeasured);
  // An unmeasured axis borrows the mean of the measured ones (1 when none);
  // its faces are drawn dashed.
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

// react-native-svg's native views take `matrix`; the web renderer only
// understands `transform`. Reanimated's animated-prop path skips the JS
// conversion between them, so the key must match the platform.
// NOTE: on-device verification of the native path is still pending.
const IS_WEB = Platform.OS === 'web';

// react-native-svg only declares `matrix` on its internal type, hence the cast.
export function matrixProp(m: Matrix): { transform: Matrix } {
  'worklet';
  return (IS_WEB ? { transform: m } : { matrix: m }) as { transform: Matrix };
}
