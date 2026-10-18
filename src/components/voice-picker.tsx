"use client";

import { useEffect, useSyncExternalStore } from "react";
import { voiceById, voiceLabel, voicesByAccent } from "@/shared/voices";

// One shared player so starting a sample stops any other.
let audio: HTMLAudioElement | null = null;
let playingId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function play(voiceId: string) {
  if (playingId === voiceId) {
    audio?.pause();
    playingId = null;
    emit();
    return;
  }
  audio?.pause();
  audio = new Audio(`/voices/${voiceId}.mp3`);
  playingId = voiceId;
  const stop = () => {
    if (playingId === voiceId) playingId = null;
    emit();
  };
  audio.addEventListener("ended", stop);
  audio.addEventListener("error", stop);
  audio.play().catch(stop);
  emit();
}

function usePlaying() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => playingId,
    () => null,
  );
}

const groups = voicesByAccent();

interface Props {
  id: string;
  value: string;
  onChange: (voiceId: string) => void;
  /** Accessible name for the select, e.g. "Voice for CLERK". */
  label: string;
  className?: string;
}

export function VoicePicker({ id, value, onChange, label, className = "" }: Props) {
  const playing = usePlaying();
  const isPlaying = playing === value;
  const voice = voiceById(value);

  // Stop the sample if the component goes away mid-play.
  useEffect(() => () => {
    if (playingId && audio) {
      audio.pause();
      playingId = null;
    }
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-control border border-line bg-raised px-2 py-1.5 text-sm text-ink focus:border-accent/60 focus:outline-none"
      >
        {!voice && <option value={value}>Choose a voice</option>}
        {groups.map(([accent, voices]) => (
          <optgroup key={accent} label={accent}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {voiceLabel(v)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        onClick={() => play(value)}
        disabled={!voice}
        aria-label={isPlaying ? "Stop sample" : `Play a sample of ${voice?.label ?? "this voice"}`}
        aria-pressed={isPlaying}
        title={isPlaying ? "Stop" : "Play sample"}
        className={`grid size-9 shrink-0 place-items-center rounded-full border transition disabled:opacity-40 ${
          isPlaying ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-accent/60 hover:text-ink"
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
          {isPlaying ? <path d="M7 6h4v12H7zM13 6h4v12h-4z" /> : <path d="M8 5v14l11-7z" />}
        </svg>
      </button>
    </div>
  );
}
