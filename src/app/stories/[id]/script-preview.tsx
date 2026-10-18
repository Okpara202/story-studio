"use client";

import { useMemo, type ReactNode } from "react";
import type { CharacterLook, ParsedStory, Scene } from "@/shared/script/types";
import { estimateLineSec, formatDuration } from "@/shared/timing";
import { EFFECTS, suggestEffects } from "@/shared/effects";
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
  /** Adds an `[fx: ...]` line under the scene. */
  onAddEffects?: (scene: Scene, effects: string[]) => void;
  /** Portrait slot for each described character. */
  renderPortrait?: (look: CharacterLook) => ReactNode;
}

export function ScriptPreview({
  parsed,
  isEmpty,
  voices,
  onVoiceChange,
  onJumpToLine,
  renderSceneImage,
  scenesToolbar,
  onAddEffects,
  renderPortrait,
}: Props) {
  const colors = useMemo(
    () => new Map(parsed.characters.map((c, i) => [c.id, speakerColor(i)])),
    [parsed.characters],
  );
  const names = useMemo(() => new Map(parsed.characters.map((c) => [c.id, c.name])), [parsed.characters]);
  const looksById = useMemo(() => new Map(parsed.looks.map((l) => [l.id, l.name])), [parsed.looks]);

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

      {parsed.looks.length > 0 && (
        <div>
          <SectionLabel>On screen ({parsed.looks.length})</SectionLabel>
          <p className="mt-1 text-xs text-muted">
            Each portrait is sent with every scene that names the character, so they look the same throughout.
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {parsed.looks.map((l) => {
              const sceneCount = parsed.scenes.filter((s) => s.characters.includes(l.id)).length;
              return (
                <li key={l.id}>
                  <Card className="flex gap-3 p-3">
                    {renderPortrait && <div className="w-24 shrink-0">{renderPortrait(l)}</div>}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onJumpToLine(l.sourceLine)}
                        className="font-medium hover:text-accent"
                      >
                        👤 {l.name}
                      </button>
                      <p className="mt-1 line-clamp-4 text-sm text-muted">{l.look}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">in {plural(sceneCount, "scene")}</p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
                  <SceneEffects scene={scene} onAdd={onAddEffects} names={looksById} />
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

/** The scene's motion effects, and effects its description suggests (one click adds them). */
function SceneEffects({
  scene,
  onAdd,
  names,
}: {
  scene: Scene;
  onAdd?: (scene: Scene, effects: string[]) => void;
  names: Map<string, string>;
}) {
  const suggested = suggestEffects(scene.description, scene.effects);
  if (!scene.effects.length && !scene.characters.length && !(onAdd && suggested.length)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2 text-xs">
      {scene.characters.map((id) => (
        <span
          key={id}
          title="Drawn to match this character's portrait"
          className="rounded-full border border-line px-2 py-px font-mono text-[11px] text-ink"
        >
          👤 {names.get(id) ?? id}
        </span>
      ))}
      {scene.effects.map((e) => (
        <span
          key={e}
          title={EFFECTS.find((x) => x.name === e)?.description}
          className="rounded-full border border-accent/40 px-2 py-px font-mono text-[11px] text-accent"
        >
          ✦ {e}
        </span>
      ))}
      {onAdd && suggested.length > 0 && (
        <button
          type="button"
          onClick={() => onAdd(scene, suggested)}
          className="rounded-full border border-dashed border-line px-2 py-px text-muted transition hover:border-accent/60 hover:text-ink"
          title={suggested.map((s) => EFFECTS.find((x) => x.name === s)?.description).join(" · ")}
        >
          + Add motion: {suggested.join(", ")}
        </button>
      )}
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
