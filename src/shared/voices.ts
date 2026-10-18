export type Gender = "male" | "female";

export interface VoiceOption {
  /** Microsoft Edge neural voice name (primary TTS provider). */
  id: string;
  label: string;
  accent: string;
  gender: Gender;
  /** Short factual note, e.g. "child voice". */
  note?: string;
  /** Closest Piper voice, used when the Edge service is unavailable. */
  piper: string;
}

/**
 * Edge voices checked against the live voice list on 2026-10-18.
 * Samples live in public/voices/{id}.mp3 (npm run voice-samples).
 */
export const VOICES: VoiceOption[] = [
  { id: "en-GB-RyanNeural", label: "Ryan", accent: "British", gender: "male", piper: "en_GB-alan-medium" },
  { id: "en-GB-ThomasNeural", label: "Thomas", accent: "British", gender: "male", piper: "en_GB-northern_english_male-medium" },
  { id: "en-GB-SoniaNeural", label: "Sonia", accent: "British", gender: "female", piper: "en_GB-jenny_dioco-medium" },
  { id: "en-GB-LibbyNeural", label: "Libby", accent: "British", gender: "female", piper: "en_GB-cori-medium" },
  { id: "en-GB-MaisieNeural", label: "Maisie", accent: "British", gender: "female", note: "child voice", piper: "en_GB-alba-medium" },
  { id: "en-US-ChristopherNeural", label: "Christopher", accent: "American", gender: "male", piper: "en_US-john-medium" },
  { id: "en-US-GuyNeural", label: "Guy", accent: "American", gender: "male", piper: "en_US-joe-medium" },
  { id: "en-US-EricNeural", label: "Eric", accent: "American", gender: "male", piper: "en_US-bryce-medium" },
  { id: "en-US-SteffanNeural", label: "Steffan", accent: "American", gender: "male", piper: "en_US-hfc_male-medium" },
  { id: "en-US-RogerNeural", label: "Roger", accent: "American", gender: "male", piper: "en_US-kusal-medium" },
  { id: "en-US-AndrewNeural", label: "Andrew", accent: "American", gender: "male", piper: "en_US-joe-medium" },
  { id: "en-US-BrianNeural", label: "Brian", accent: "American", gender: "male", piper: "en_US-bryce-medium" },
  { id: "en-US-AriaNeural", label: "Aria", accent: "American", gender: "female", piper: "en_US-amy-medium" },
  { id: "en-US-JennyNeural", label: "Jenny", accent: "American", gender: "female", piper: "en_US-kristin-medium" },
  { id: "en-US-MichelleNeural", label: "Michelle", accent: "American", gender: "female", piper: "en_US-hfc_female-medium" },
  { id: "en-US-EmmaNeural", label: "Emma", accent: "American", gender: "female", piper: "en_US-lessac-medium" },
  { id: "en-US-AvaNeural", label: "Ava", accent: "American", gender: "female", piper: "en_US-amy-medium" },
  { id: "en-US-AnaNeural", label: "Ana", accent: "American", gender: "female", note: "child voice", piper: "en_US-kristin-medium" },
  { id: "en-IE-ConnorNeural", label: "Connor", accent: "Irish", gender: "male", piper: "en_GB-alan-medium" },
  { id: "en-IE-EmilyNeural", label: "Emily", accent: "Irish", gender: "female", piper: "en_GB-cori-medium" },
  { id: "en-NG-AbeoNeural", label: "Abeo", accent: "Nigerian", gender: "male", piper: "en_GB-northern_english_male-medium" },
  { id: "en-NG-EzinneNeural", label: "Ezinne", accent: "Nigerian", gender: "female", piper: "en_GB-jenny_dioco-medium" },
  { id: "en-KE-ChilembaNeural", label: "Chilemba", accent: "Kenyan", gender: "male", piper: "en_US-john-medium" },
  { id: "en-KE-AsiliaNeural", label: "Asilia", accent: "Kenyan", gender: "female", piper: "en_US-lessac-medium" },
  { id: "en-ZA-LukeNeural", label: "Luke", accent: "South African", gender: "male", piper: "en_US-hfc_male-medium" },
  { id: "en-ZA-LeahNeural", label: "Leah", accent: "South African", gender: "female", piper: "en_US-hfc_female-medium" },
  { id: "en-AU-WilliamMultilingualNeural", label: "William", accent: "Australian", gender: "male", piper: "en_US-kusal-medium" },
  { id: "en-AU-NatashaNeural", label: "Natasha", accent: "Australian", gender: "female", piper: "en_GB-alba-medium" },
];

/** Piper voices per gender, for giving each character a different fallback voice. */
export const PIPER_POOL: Record<Gender, string[]> = {
  male: [...new Set(VOICES.filter((v) => v.gender === "male").map((v) => v.piper))],
  female: [...new Set(VOICES.filter((v) => v.gender === "female").map((v) => v.piper))],
};

export const DEFAULT_NARRATOR_VOICE = "en-GB-RyanNeural";

export function voiceById(id: string): VoiceOption | undefined {
  return VOICES.find((v) => v.id === id);
}

export function voiceLabel(v: VoiceOption): string {
  return `${v.label} · ${v.accent} ${v.gender}${v.note ? ` · ${v.note}` : ""}`;
}

/** Voices grouped by accent, in catalog order, for <optgroup> menus. */
export function voicesByAccent(): [string, VoiceOption[]][] {
  const groups = new Map<string, VoiceOption[]>();
  for (const v of VOICES) groups.set(v.accent, [...(groups.get(v.accent) ?? []), v]);
  return [...groups];
}

/**
 * Suggest distinct voices for characters that have none yet, so a new story
 * sounds varied without any clicks. The narrator keeps the channel voice.
 * Unknown saved ids (e.g. a voice Microsoft retired) are replaced too.
 */
export function suggestVoices(
  speakerIds: string[],
  current: Record<string, string>,
  narratorVoice: string,
  narratorId = "NARRATOR",
): Record<string, string> {
  const result: Record<string, string> = {};
  const valid = (id: string | undefined) => (id && voiceById(id) ? id : undefined);
  const used = new Set([narratorVoice, ...Object.values(current).filter((id) => valid(id))]);
  const pool = VOICES.filter((v) => !v.note).map((v) => v.id).filter((id) => !used.has(id));
  let next = 0;
  for (const id of speakerIds) {
    const saved = valid(current[id]);
    if (saved) result[id] = saved;
    else if (id === narratorId) result[id] = valid(narratorVoice) ?? DEFAULT_NARRATOR_VOICE;
    else result[id] = pool[next++ % Math.max(pool.length, 1)] ?? narratorVoice;
  }
  return result;
}
