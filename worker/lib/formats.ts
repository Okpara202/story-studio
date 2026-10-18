import type { VideoFormat } from "../../src/shared/job.ts";

export interface FormatSpec {
  width: number;
  height: number;
  caption: {
    fontSize: number;
    maxCharsPerLine: number;
    maxLines: number;
    /** Distance of the caption's bottom edge from the bottom of the frame. */
    marginBottom: number;
    marginSide: number;
  };
}

export const FORMATS: Record<VideoFormat, FormatSpec> = {
  "16x9": {
    width: 1280,
    height: 720,
    caption: { fontSize: 42, maxCharsPerLine: 44, maxLines: 2, marginBottom: 56, marginSide: 120 },
  },
  "9x16": {
    width: 720,
    height: 1280,
    // Lower-middle safe area: platform UI (buttons, captions, progress) covers roughly the bottom 25%.
    caption: { fontSize: 52, maxCharsPerLine: 22, maxLines: 2, marginBottom: 340, marginSide: 60 },
  },
};
