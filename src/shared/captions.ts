export interface CaptionEvent {
  start: number;
  end: number;
  /** Caption text; lines separated by "\n". */
  text: string;
}

/** Greedy word wrap. A single word longer than the limit gets its own line. */
export function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Split one spoken line into caption events of at most `maxLines` wrapped
 * lines each. Time is shared out by character count, which tracks speech
 * length closely enough for captions.
 */
export function splitCaption(
  text: string,
  start: number,
  end: number,
  maxCharsPerLine: number,
  maxLines: number,
): CaptionEvent[] {
  const wrapped = wrapWords(text, maxCharsPerLine);
  const chunks: string[][] = [];
  for (let i = 0; i < wrapped.length; i += maxLines) {
    chunks.push(wrapped.slice(i, i + maxLines));
  }
  if (chunks.length === 0) return [];
  const weights = chunks.map((c) => c.join(" ").length);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = end - start;
  let t = start;
  return chunks.map((c, i) => {
    const next = i === chunks.length - 1 ? end : t + (span * weights[i]) / total;
    const event = { start: t, end: next, text: c.join("\n") };
    t = next;
    return event;
  });
}
