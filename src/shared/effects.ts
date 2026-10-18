/**
 * Scene motion effects, written as `[fx: flicker, shake]` under a scene. They
 * animate the whole picture (light, camera, haze), not single objects in it:
 * the renderer can't tell which pixels are the lamp or the winch.
 */
export interface Effect {
  name: string;
  aliases: string[];
  /** What it looks like, for the guide and editor. */
  description: string;
  /** Words in a scene description that suggest this effect. */
  hints: RegExp;
}

export const EFFECTS: Effect[] = [
  {
    name: "flicker",
    aliases: ["blink", "blinking", "flickering", "strobe"],
    description: "Light stutters like a failing fluorescent tube",
    hints: /\b(fluorescent|flicker\w*|blink\w*|strob\w*|neon|power cut|failing light|bulb)\b/i,
  },
  {
    name: "shake",
    aliases: ["vibrate", "vibration", "rumble", "tremble", "quake"],
    description: "Fine rapid vibration, as if the camera is bolted to running machinery",
    hints: /\b(spinning|winch|engine|machine\w*|motor|rumbl\w*|vibrat\w*|earthquake|tremor|drill|generator|turbine|explosion|train)\b/i,
  },
  {
    name: "pulse",
    aliases: ["glow", "throb", "heartbeat"],
    description: "Slow rhythmic glow, like an alarm light or a heartbeat",
    hints: /\b(sonar|alarm|puls\w*|heartbeat|siren|beacon|warning light)\b/i,
  },
  {
    name: "drift",
    aliases: ["fog", "mist", "haze", "dust", "smoke"],
    description: "Soft haze slowly drifting across the frame",
    hints: /\b(fog\w*|mist\w*|dust\w*|smok\w*|haze|hazy|underwater|murky|steam\w*|ocean floor)\b/i,
  },
  {
    name: "glitch",
    aliases: ["static", "signal", "distort"],
    description: "Brief signal tears and static, like a failing screen or tape",
    hints: /\b(screens?|monitors?|static|glitch\w*|cctv|camera feed|television|tv|signal|tape)\b/i,
  },
];

/** Most effects a scene can stack before it looks busy. */
export const MAX_EFFECTS_PER_SCENE = 3;

export function findEffect(word: string): Effect | undefined {
  const w = word.trim().toLowerCase();
  return EFFECTS.find((e) => e.name === w || e.aliases.includes(w));
}

/** Effects the scene's description hints at, excluding ones already set. */
export function suggestEffects(description: string | null, current: string[] = []): string[] {
  if (!description) return [];
  return EFFECTS.filter((e) => !current.includes(e.name) && e.hints.test(description))
    .map((e) => e.name)
    .slice(0, Math.max(0, MAX_EFFECTS_PER_SCENE - current.length));
}
