"use client";

import { useState, useTransition, type ReactNode } from "react";
import { DEFAULT_STYLE, type StyleSettings } from "@/shared/job";
import { Button, Card } from "@/components/ui";
import { VoicePicker } from "@/components/voice-picker";
import { saveStyleAction } from "../actions";
import { MusicPicker } from "./music-picker";

const FONTS = ["DejaVu Sans", "Liberation Sans", "Noto Sans"];
const SAMPLE_SCENE = "a brass key with a paper tag, lying on a dark carpet";

export function StyleForm({ saved: initial, musicUrl }: { saved: StyleSettings; musicUrl: string | null }) {
  const [saved, setSaved] = useState(initial);
  const [style, setStyle] = useState(initial);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const dirty = JSON.stringify(style) !== JSON.stringify(saved);

  const patch = (p: Partial<StyleSettings>) => {
    setJustSaved(false);
    setStyle((s) => ({ ...s, ...p }));
  };

  const save = () =>
    startSave(async () => {
      try {
        await saveStyleAction(style);
        setSaved(style);
        setJustSaved(true);
        setError(null);
      } catch {
        setError("Could not save. Check your connection and try again.");
      }
    });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Set once</p>
      <h1 className="mt-1 font-serif text-3xl sm:text-4xl">Channel style</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        These settings apply to every story, so the channel keeps one recognisable look and voice.
      </p>

      <div className="mt-8 space-y-5">
        <Section title="Art style" hint="Added to the end of every image prompt.">
          <textarea
            aria-label="Art style"
            value={style.artStyle}
            onChange={(e) => patch({ artStyle: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-control border border-line bg-raised p-3 text-sm leading-relaxed focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-3 rounded-control border border-dashed border-line p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Example prompt</p>
            <p className="mt-1 text-sm">
              {SAMPLE_SCENE}
              <span className="text-accent">, {style.artStyle || "…"}</span>
            </p>
          </div>
          <p className="mt-2 text-xs text-muted">
            Tip: keep the main subject centred with space around it, so one image works in both 16:9 and 9:16.
            Shadows, rooms and documents age better than detailed faces.
          </p>
        </Section>

        <Section
          title="Narrator voice"
          hint="The channel's signature voice. Press play to hear each one; other characters get distinct voices automatically."
        >
          <VoicePicker
            id="narrator-voice"
            label="Narrator voice"
            value={style.narratorVoice}
            onChange={(v) => patch({ narratorVoice: v })}
          />
        </Section>

        <Section title="Captions" hint="Burned into the video. Vertical videos use larger text, placed above the platform buttons.">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={style.captions.enabled}
                onChange={(e) => patch({ captions: { ...style.captions, enabled: e.target.checked } })}
                className="size-4 accent-[var(--accent)]"
              />
              Show captions
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Font</span>
              <select
                value={style.captions.font}
                disabled={!style.captions.enabled}
                onChange={(e) => patch({ captions: { ...style.captions, font: e.target.value } })}
                className="rounded-control border border-line bg-raised px-2 py-1 text-sm disabled:opacity-50"
              >
                {FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>
          {style.captions.enabled && <CaptionPreview />}
        </Section>

        <Section title="Background music" hint="Royalty-free only, e.g. from the YouTube Audio Library. Mixed quietly under the voices.">
          <MusicPicker
            file={style.music.file}
            initialUrl={style.music.file === initial.music.file ? musicUrl : null}
            onChange={(file) => patch({ music: { ...style.music, file } })}
          />
          <label className="mt-4 flex items-center gap-4 text-sm">
            <span className="w-24 shrink-0 text-muted">Music level</span>
            <input
              type="range"
              min={-30}
              max={-8}
              step={1}
              value={style.music.volumeDb}
              onChange={(e) => patch({ music: { ...style.music, volumeDb: Number(e.target.value) } })}
              className="flex-1 accent-[var(--accent)]"
            />
            <span className="w-24 text-right font-mono text-xs text-muted">
              {style.music.volumeDb} dB · {musicLabel(style.music.volumeDb)}
            </span>
          </label>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface/95 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" onClick={() => patch(DEFAULT_STYLE)}>
            Reset to defaults
          </Button>
          <span aria-live="polite" className="ml-auto text-xs text-muted">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : justSaved && !dirty ? (
              "Saved"
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              ""
            )}
          </span>
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save style"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function musicLabel(db: number) {
  if (db <= -24) return "faint";
  if (db <= -16) return "quiet";
  return "present";
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-medium">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{hint}</p>
      {children}
    </Card>
  );
}

/** Mini frames that mirror the renderer's caption placement (worker/lib/formats.ts). */
function CaptionPreview() {
  const frame =
    "relative overflow-hidden rounded-control border border-line bg-[radial-gradient(ellipse_at_50%_40%,#4a3b2a,#1b2333_70%)]";
  const caption = "absolute inset-x-0 text-center font-semibold leading-tight text-white [text-shadow:0_0_3px_#000,0_1px_2px_#000]";
  return (
    <div className="mt-4 flex items-end gap-4">
      <figure className="flex-1">
        <div className={`${frame} aspect-video`}>
          <p className={`${caption} bottom-[8%] px-[9%] text-[clamp(9px,1.6vw,14px)]`}>
            The handwriting was my own.
            <br />
            The date on the postmark was tomorrow.
          </p>
        </div>
        <figcaption className="mt-1.5 font-mono text-[11px] text-muted">16:9 · YouTube</figcaption>
      </figure>
      <figure className="w-[22%] min-w-20">
        <div className={`${frame} aspect-[9/16]`}>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[24%] bg-black/35" />
          <p className={`${caption} bottom-[26.5%] px-[8%] text-[clamp(8px,1.3vw,12px)]`}>
            The handwriting
            <br />
            was my own.
          </p>
        </div>
        <figcaption className="mt-1.5 font-mono text-[11px] text-muted">9:16 · Shorts</figcaption>
      </figure>
    </div>
  );
}
