import { memo, useEffect, useRef } from 'react';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { alpha, useAppTheme } from '@/theme';
import { cubeLayout, FRAME_H, FRAME_W, ISO, isMeasured } from './cubeLayout';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedText = Animated.createAnimatedComponent(SvgText);

// The drawing lives in a fixed viewBox so the geometry can animate without the
// viewBox animating with it (animated viewBox is poorly supported). The padding
// leaves room for the edge labels, which hang outside the shape.
const PAD_LEFT = 48;
const PAD_RIGHT = 40;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const VIEW_BOX = [
  -PAD_LEFT,
  -PAD_TOP,
  FRAME_W + PAD_LEFT + PAD_RIGHT,
  FRAME_H + PAD_TOP + PAD_BOTTOM,
].join(' ');
// NOTE: fixed, not measured from the shape. The frame fit means the drawing
// always fills the frame in one direction, so a flat product wastes little
// space here; sizing this to the shape would need the height animated too.
const SVG_HEIGHT = 210;

const LABEL_GAP = 15;
const FONT_SIZE = 12;
/** Unit normal of an edge sloping at ISO, used to push labels clear of it. */
const NORMAL_X = Math.sin(Math.PI / 6);
const NORMAL_Y = Math.cos(Math.PI / 6);

const TIMING = {
  duration: 200,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/** Marks a face whose shape is inferred rather than measured. */
const UNCERTAIN_DASH = '5 4';
const UNCERTAIN_FILL_OPACITY = 0.25;

type Matrix = [number, number, number, number, number, number];

/** skewY(30) — the front face never moves, so its matrix is a constant. */
const FRONT_MATRIX: Matrix = [1, ISO, 0, 1, 0, 0];

type CubeProps = {
  /** Width along X, in centimetres. `undefined` means unmeasured. */
  width?: number;
  /** Height along Y, in centimetres. */
  height?: number;
  /** Depth along Z, in centimetres. */
  depth?: number;
};

function axisLabel(value: number | undefined): string {
  return isMeasured(value) ? `${value} cm` : '—';
}

function describeDimensions(
  width: number | undefined,
  height: number | undefined,
  depth: number | undefined,
): string {
  const axes = [
    ['width', width],
    ['height', height],
    ['depth', depth],
  ] as const;
  const parts = axes.map(([name, value]) =>
    isMeasured(value) ? `${name} ${value} centimetres` : `${name} not measured`,
  );
  return `Scale drawing of the product: ${parts.join(', ')}`;
}

function Cube({ width, height, depth }: CubeProps) {
  // Hooks
  const theme = useAppTheme();
  const layout = cubeLayout(width, height, depth);

  const w = useSharedValue(layout.w);
  const h = useSharedValue(layout.h);
  const d = useSharedValue(layout.d);
  const tx = useSharedValue(layout.tx);
  const ty = useSharedValue(layout.ty);

  // Retarget rather than queue: withTiming interpolates from wherever the value
  // currently sits, so typing 1 -> 10 -> 100 redirects mid-flight instead of
  // playing three animations back to back. The mount run is skipped outright —
  // withTiming to an equal target still burns the full 200ms of UI-thread
  // frames, and product detail is read-mostly; an assembling cube per visit
  // (or a no-op animation behind it) is a tax.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    w.value = withTiming(layout.w, TIMING);
    h.value = withTiming(layout.h, TIMING);
    d.value = withTiming(layout.d, TIMING);
    tx.value = withTiming(layout.tx, TIMING);
    ty.value = withTiming(layout.ty, TIMING);
  }, [layout.w, layout.h, layout.d, layout.tx, layout.ty, w, h, d, tx, ty]);

  // Each face is a column-major matrix whose 2x2 part is constant, leaving the
  // translation as the only animated term. Keeping every animated value numeric
  // avoids rebuilding transform strings inside a worklet, and avoids the
  // transform shorthand props react-native-svg 15 marks deprecated.
  const groupProps = useAnimatedProps(() => ({
    transform: [1, 0, 0, 1, tx.value, ty.value] as Matrix,
  }));
  const frontProps = useAnimatedProps(() => ({ width: w.value, height: h.value }));
  // skewY(-30) translate(w, 2*ISO*w), composed.
  const sideProps = useAnimatedProps(() => ({
    width: d.value,
    height: h.value,
    transform: [1, -ISO, 0, 1, w.value, ISO * w.value] as Matrix,
  }));
  // Maps the w*d rect onto the top parallelogram: (0,d) -> origin, (w,d) ->
  // (w, ISO*w) meeting the front face, and (0,0) -> (d, -ISO*d).
  const topProps = useAnimatedProps(() => ({
    width: w.value,
    height: d.value,
    transform: [1, ISO, -1, ISO, d.value, -ISO * d.value] as Matrix,
  }));

  // Labels sit one gap along the outward normal of the edge they measure.
  const widthLabel = useAnimatedProps(() => ({
    x: w.value / 2 - LABEL_GAP * NORMAL_X,
    y: h.value + (ISO * w.value) / 2 + LABEL_GAP * NORMAL_Y,
  }));
  const depthLabel = useAnimatedProps(() => ({
    x: w.value + d.value / 2 + LABEL_GAP * NORMAL_X,
    y: h.value + ISO * w.value - (ISO * d.value) / 2 + LABEL_GAP * NORMAL_Y,
  }));
  const heightLabel = useAnimatedProps(() => ({ x: -LABEL_GAP, y: h.value / 2 }));

  // Derived values
  // One hue at three luminances reads as a lit solid; three different hues read
  // as three panels. The ramp flips with the scheme because `primary` is dark on
  // light and light on dark, and the top face stays the brightest either way.
  const base = theme.colors.primary;
  const tone = theme.dark ? { top: 1, front: 0.74, side: 0.5 } : { top: 0.5, front: 0.74, side: 1 };

  // A face is only asserted when both of the axes spanning it were measured.
  const hasW = isMeasured(width);
  const hasH = isMeasured(height);
  const hasD = isMeasured(depth);
  const face = (opacity: number, certain: boolean) => ({
    fill: alpha(base, opacity),
    fillOpacity: certain ? 1 : UNCERTAIN_FILL_OPACITY,
    stroke: theme.colors.outline,
    strokeDasharray: certain ? undefined : UNCERTAIN_DASH,
  });
  const label = {
    fill: theme.colors.onSurfaceVariant,
    fontSize: FONT_SIZE,
    alignmentBaseline: 'middle',
  } as const;

  // Render
  return (
    <Svg
      width="100%"
      height={SVG_HEIGHT}
      viewBox={VIEW_BOX}
      accessibilityRole="image"
      accessibilityLabel={describeDimensions(width, height, depth)}
    >
      <AnimatedG animatedProps={groupProps}>
        <AnimatedRect
          animatedProps={frontProps}
          transform={FRONT_MATRIX}
          {...face(tone.front, hasW && hasH)}
        />
        <AnimatedRect animatedProps={sideProps} {...face(tone.side, hasD && hasH)} />
        <AnimatedRect animatedProps={topProps} {...face(tone.top, hasW && hasD)} />
        <AnimatedText animatedProps={widthLabel} textAnchor="middle" {...label}>
          {axisLabel(width)}
        </AnimatedText>
        <AnimatedText animatedProps={depthLabel} textAnchor="middle" {...label}>
          {axisLabel(depth)}
        </AnimatedText>
        <AnimatedText animatedProps={heightLabel} textAnchor="end" {...label}>
          {axisLabel(height)}
        </AnimatedText>
      </AnimatedG>
    </Svg>
  );
}

// The parent form re-renders on every keystroke in ANY physical-property field
// (weight included); three primitive props make memo a free skip of the layout
// math and the seven animated-prop registrations.
export default memo(Cube);
