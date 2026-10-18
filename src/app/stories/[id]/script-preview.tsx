"use client";

import { useMemo, type ReactNode } from "react";
import type { ParsedStory, Scene } from "@/shared/script/types";
import { estimateLineSec, formatDuration } from "@/shared/timing";
import { Card, plural, SectionLabel, speakerColor } from "@/components/ui";
import { VoicePicker } from "@/components/voice-picker";

interface Props {
  parsed: ParsedStory;
  isEmpty: boolean;
  voices: Record<string, string>;
  onVoiceChange: (speakerId: string, voiceId: string) => void;
  onJumpToLine: (line: number) => void;
  /** Image slot shown beside each scene's lines. */
  renderSceneImage?: (scene: Scene) => ReactNode;
  /** Extra controls next to the Scenes heading. */
  scenesToolbar?: ReactNode;
}

export function ScriptPreview({
  parsed,
  isEmpty,
  voices,
  onVoiceChange,
  onJumpToLine,
  renderSceneImage,
  scenesToolbar,
}: Props) {
  const colors = useMemo(
    () => new Map(parsed.characters.map((c, i) => [c.id, speakerColor(i)])),
    [parsed.characters],
  );
  const names = useMemo(() => new Map(parsed.characters.map((c) => [c.id, c.name])), [parsed.characters]);

  if (isEmpty) {
    return (
      <Card className="p-8 text-center">
        <p className="font-serif text-xl">Your preview appears here</p>
        <p className="mt-2 text-sm text-muted">
          As you write, scenes, characters and the estimated length show up live. Nothing is generated until
          you press Generate.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {parsed.issues.length > 0 && (
        <div>
          <SectionLabel>Check these ({parsed.issues.length})</SectionLabel>
          <ul className="mt-3 space-y-1.5">
            {parsed.issues.map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => issue.line && onJumpToLine(issue.line)}
                  disabled={!issue.line}
                  className={`flex w-full items-start gap-3 rounded-control border px-3 py-2 text-left text-sm transition enabled:hover:bg-raised ${
                    issue.severity === "error" ? "border-danger/50" : "border-line"
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 font-mono text-[11px] uppercase tracking-wider ${
                      issue.severity === "error" ? "text-danger" : "text-accent"
                    }`}
                  >
                    {issue.severity === "error" ? "Error" : "Note"}
                    {issue.line ? ` · L${issue.line}` : ""}
                  </span>
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionLabel>Cast & voices ({parsed.characters.length})</SectionLabel>
        {parsed.characters.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No speakers yet. Lines like NARRATOR: … add them.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {parsed.characters.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colors.get(c.id) }} />
                  <div className="min-w-0 flex-1 basis-32">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="font-mono text-[11px] text-muted">{plural(c.lineCount, "line")}</div>
                  </div>
                  <VoicePicker
                    id={`voice-${c.id}`}
                    label={`Voice for ${c.name}`}
                    value={voices[c.id] ?? ""}
                    onChange={(v) => onVoiceChange(c.id, v)}
                    className="min-w-0 flex-2 basis-56"
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Scenes ({parsed.scenes.length})</SectionLabel>
          {scenesToolbar}
        </div>
        <ol className="mt-3 space-y-3">
          {parsed.scenes.map((scene) => {
            const sec =
              scene.lines.reduce((n, l) => n + estimateLineSec(l.text, l.parts) + l.pauseBefore, 0) + scene.pauseAfter;
            return (
              <li key={scene.index}>
                <Card className="overflow-hidden">
                  <div className="flex items-start gap-3 border-b border-line bg-raised/50 px-4 py-3">
                    <span className="mt-0.5 font-mono text-xs text-accent">
                      {String(scene.index).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={() => onJumpToLine(scene.sourceLine)}
                      className="min-w-0 flex-1 text-left text-sm hover:text-accent"
                    >
                      {scene.description ?? (
                        <span className="italic text-muted">
                          No description: the image prompt will be built from this scene&apos;s text
                        </span>
                      )}
                    </button>
                    <span className="shrink-0 font-mono text-xs text-muted">~{formatDuration(sec)}</span>
                  </div>
                  <div className={renderSceneImage ? "grid gap-4 p-4 sm:grid-cols-[8.5rem_1fr]" : "px-4 py-3"}>
                    {renderSceneImage && <div className="max-w-44">{renderSceneImage(scene)}</div>}
                    {scene.lines.length === 0 ? (
                      <p className="text-sm italic text-muted">Silent scene (shown for 3 s)</p>
                    ) : (
                      <ul className="space-y-2">
                        {scene.lines.map((line, i) => (
                          <li key={i} className="space-y-2">
                            {line.pauseBefore > 0 && <PauseMarker sec={line.pauseBefore} />}
                            <div
                              className="border-l-2 pl-3 text-sm leading-relaxed"
                              style={{ borderColor: colors.get(line.speakerId) }}
                            >
                              <span
                                className="mr-2 font-mono text-[11px] uppercase tracking-wider"
                                style={{ color: colors.get(line.speakerId) }}
                              >
                                {names.get(line.speakerId)}
                              </span>
                              {line.cues.map((c) => (
                                <span
                                  key={c}
                                  className="mr-1.5 rounded-full border border-line px-1.5 py-px font-mono text-[10px] text-muted"
                                >
                                  {c}
                                </span>
                              ))}
                              <LineText caption={line.caption} parts={line.parts} />
                            </div>
                          </li>
                        ))}
                        {scene.pauseAfter > 0 && (
                          <li>
                            <PauseMarker sec={scene.pauseAfter} />
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function PauseMarker({ sec }: { sec: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 font-mono text-[11px] text-muted">
      <span aria-hidden>⏸</span> pause {sec}s
    </span>
  );
}

/**
 * A line as it will be heard: inline pauses shown where they fall, or, when
 * there are none, the caption text with *emphasis* in italics.
 */
function LineText({ caption, parts }: { caption: string; parts: (string | number)[] }) {
  if (parts.some((p) => typeof p === "number")) {
    return (
      <>
        {parts.map((p, i) =>
          typeof p === "number" ? (
            <span key={i} className="mx-1 font-mono text-[11px] text-muted">
              ⏸ {p}s
            </span>
          ) : (
            <span key={i}>{p} </span>
          ),
        )}
      </>
    );
  }
  return (
    <>
      {caption.split(/(\*[^*]+\*)/).map((piece, i) =>
        piece.startsWith("*") && piece.endsWith("*") && piece.length > 2 ? (
          <em key={i} className="text-ink">
            {piece.slice(1, -1)}
          </em>
        ) : (
          <span key={i}>{piece}</span>
        ),
      )}
    </>
  );
}
