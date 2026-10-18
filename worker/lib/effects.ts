import type { Size } from "./motion.ts";

/**
 * ffmpeg pieces for a scene's motion effects. All are per-frame expressions on
 * the scene's own frame counter `n`, so they cost little: no extra inputs and
 * no per-pixel expression filters (geq is far too slow for a weak runner).
 */
export interface EffectPlan {
  /** Added to the pan crop's x / y expressions (camera shake). */
  jitterX: string;
  jitterY: string;
  /** Filters applied after the crop, in order. */
  after: string[];
  /** Haze: the frame is split, blurred, scrolled and screen-blended over itself. */
  drift: boolean;
}

// Sums of sines with unrelated frequencies: irregular, but the same on every render.
// No dip in a scene's first half second: a dark first frame reads as a bad cut.
const FLICKER_DIP = "gt(sin(n*0.71)+sin(n*1.93)+sin(n*0.37),1.75)*gt(n,15)";
const GLITCH_ON = "gt(sin(n*0.53)+sin(n*1.31)+sin(n*0.19),2.1)";

export function planEffects(effects: string[], frame: Size): EffectPlan {
  const has = (name: string) => effects.includes(name);
  const plan: EffectPlan = { jitterX: "", jitterY: "", after: [], drift: has("drift") };

  if (has("shake")) {
    const a = Math.max(2, Math.round(Math.min(frame.w, frame.h) * 0.006));
    plan.jitterX = `+${a}*sin(n*2.7)*sin(n*0.83)`;
    plan.jitterY = `+${a}*sin(n*3.1)*sin(n*1.17)`;
  }

  // Light changes share one eq filter. A flicker dips through gamma, which dims
  // without crushing dark pictures to black (a black frame reads as a cut).
  const brightness: string[] = [];
  let gamma = "";
  if (has("flicker")) {
    gamma = `1-0.38*${FLICKER_DIP}`;
    brightness.push("0.012*sin(n*2.9)");
  }
  if (has("pulse")) brightness.push("0.06*sin(2*PI*n/60)");
  if (brightness.length || gamma) {
    const parts = [brightness.length && `brightness='${brightness.join("+")}'`, gamma && `gamma='${gamma}'`].filter(Boolean);
    plan.after.push(`eq=${parts.join(":")}:eval=frame`);
  }

  if (has("glitch")) {
    plan.after.push(
      `rgbashift=rh=16:bh=-16:enable='${GLITCH_ON}'`,
      `noise=alls=45:allf=t:enable='${GLITCH_ON}'`,
    );
  }
  return plan;
}

/**
 * The drift haze chain between labels `inLabel` and `outLabel`: a blurred,
 * enlarged copy glides slowly back and forth (no wrap-around seam) and is
 * screen-blended over the picture.
 */
export function driftGraph(inLabel: string, outLabel: string, frame: Size): string {
  return (
    `[${inLabel}]split[${inLabel}a][${inLabel}b];` +
    `[${inLabel}b]boxblur=luma_radius=24:luma_power=2,scale=${Math.round(frame.w * 1.3 / 2) * 2}:${Math.round(frame.h * 1.3 / 2) * 2},` +
    `crop=${frame.w}:${frame.h}:x='(iw-ow)*(0.5+0.5*sin(n/70))':y='(ih-oh)*(0.5+0.5*sin(n/110+1))'[${inLabel}h];` +
    `[${inLabel}a][${inLabel}h]blend=all_mode=screen:all_opacity=0.3[${outLabel}]`
  );
}
