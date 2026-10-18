import type { CaptionEvent } from "../../src/shared/captions.ts";
import type { FormatSpec } from "./formats.ts";

/** ASS timestamp: h:mm:ss.cc */
export function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

/** Neutralise characters that ASS treats as markup. */
export function assText(text: string): string {
  return text
    .replace(/\\/g, "/")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\n/g, "\\N");
}

export function buildAss(events: CaptionEvent[], spec: FormatSpec, font: string): string {
  const c = spec.caption;
  // White text, black outline and soft shadow: readable on any image without a box.
  const style = [
    "Default", font, c.fontSize,
    "&H00FFFFFF", "&H00FFFFFF", "&H00000000", "&H80000000",
    0, 0, 0, 0, 100, 100, 0, 0,
    1, 3, 1,
    2, c.marginSide, c.marginSide, c.marginBottom, 1,
  ].join(",");
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${spec.width}`,
    `PlayResY: ${spec.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${style}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const lines = events.map(
    (e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${assText(e.text)}`,
  );
  return [...header, ...lines, ""].join("\n");
}
