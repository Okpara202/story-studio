export interface Size {
  w: number;
  h: number;
}

export interface MotionPlan {
  /** Size the image is scaled to once, before panning. */
  scaled: Size;
  /** Crop window top-left at the first and last frame. */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface MotionOptions {
  /** How much bigger than the frame the image is scaled, giving room to pan. */
  margin: number;
  /** Pan distance as a fraction of the frame's longer side. */
  travel: number;
}

export const DEFAULT_MOTION: MotionOptions = { margin: 1.12, travel: 0.08 };

// Varied so consecutive scenes don't all drift the same way.
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, -0.7],
];

const even = (n: number) => 2 * Math.ceil(n / 2);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Plan a cheap Ken Burns pan: scale the image once to cover the frame with a
 * margin, then slide a frame-sized crop window across it around the focus point.
 */
export function planMotion(
  image: Size,
  frame: Size,
  sceneNo: number,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
  opts: MotionOptions = DEFAULT_MOTION,
): MotionPlan {
  const k = Math.max((frame.w * opts.margin) / image.w, (frame.h * opts.margin) / image.h);
  const scaled = { w: even(image.w * k), h: even(image.h * k) };
  const maxX = scaled.w - frame.w;
  const maxY = scaled.h - frame.h;
  const [dx, dy] = DIRECTIONS[(sceneNo - 1) % DIRECTIONS.length];
  const half = (opts.travel * Math.max(frame.w, frame.h)) / 2;

  const cx = clamp(focus.x * scaled.w - frame.w / 2, 0, maxX);
  const cy = clamp(focus.y * scaled.h - frame.h / 2, 0, maxY);
  const point = (sign: number) => ({
    x: Math.round(clamp(cx + sign * dx * half, 0, maxX)),
    y: Math.round(clamp(cy + sign * dy * half, 0, maxY)),
  });
  return { scaled, from: point(-1), to: point(1) };
}

/** ffmpeg expression moving linearly from a to b over frames 0..last. */
export function lerpExpr(a: number, b: number, lastFrame: number): string {
  const d = b - a;
  if (d === 0 || lastFrame <= 0) return String(a);
  return `${a}${d > 0 ? "+" : "-"}${Math.abs(d)}*n/${lastFrame}`;
}
