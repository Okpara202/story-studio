import type { ParsedStory } from "./script/types.ts";
import type { JobStatus } from "./status.ts";

/** YouTube limits: title 100 characters, all tags together 500. */
export const TITLE_MAX = 100;
export const TAGS_MAX_CHARS = 500;

export interface PublishText {
  title: string;
  description: string;
  tags: string[];
}

const BASE_TAGS = ["mystery story", "horror story", "scary stories", "fiction", "storytelling", "creepy stories"];

/** The opening of the story: at most two lines (more risks giving the ending away), cut at a word. */
export function hookOf(parsed: ParsedStory, maxChars = 220): string {
  const lines = parsed.scenes.flatMap((s) => s.lines).map((l) => l.text.trim()).filter(Boolean);
  let hook = "";
  for (const line of lines.slice(0, 2)) {
    const next = hook ? `${hook} ${line}` : line;
    if (next.length > maxChars) {
      if (!hook) hook = line.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
      break;
    }
    hook = next;
  }
  return hook;
}

/** Suggested upload text. A starting point only: the owner edits it per story and per platform. */
export function suggestPublishText(parsed: ParsedStory): PublishText {
  const title = (parsed.title || "Untitled story").slice(0, TITLE_MAX);
  const hook = hookOf(parsed);
  const description = [
    hook,
    "",
    `"${title}" is an original work of fiction. Any resemblance to real people, places or events is coincidental.`,
    "Narration and illustrations were made with the help of AI tools.",
    "",
    "#mystery #horror #fiction",
  ]
    .join("\n")
    .trim();

  const tags: string[] = [];
  const add = (tag: string) => {
    const t = tag.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, "").replace(/\s+/g, " ").trim();
    if (!t || tags.includes(t)) return;
    if ([...tags, t].join(",").length > TAGS_MAX_CHARS) return;
    tags.push(t);
  };
  if (title.length <= 40) add(title);
  BASE_TAGS.forEach(add);
  return { title, description, tags };
}

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
}

/** Steps for a YouTube long-form upload. Ticks are remembered per story in the browser. */
export const PUBLISH_CHECKLIST: ChecklistItem[] = [
  { id: "own-script", label: "The script is mine", hint: "Written or edited by you, never raw AI text." },
  { id: "watched", label: "Watched the whole video once", hint: "Check voices, images and captions." },
  { id: "downloaded", label: "Downloaded the 16:9 video" },
  { id: "details", label: "Pasted the title, description and tags", hint: "Change a few words so each post is unique." },
  {
    id: "altered",
    label: "Altered or synthetic content: Yes",
    hint: "YouTube asks this at upload. Realistic AI voices and images need the label.",
  },
  { id: "kids", label: "Audience: No, it's not made for kids" },
  { id: "thumbnail", label: "Picked a thumbnail", hint: "A strong frame from the video works." },
];

export interface RenderChanges {
  /** Script or voices were edited after the videos were made. */
  script: boolean;
  /** Scenes whose image changed (or went missing) after the videos were made. */
  scenes: number[];
}

/**
 * What the current videos don't show yet. Only meaningful for a finished run:
 * anything saved after `finishedAt` is newer than the videos.
 */
export function changesSinceRender(
  status: Pick<JobStatus, "state" | "finishedAt"> | null,
  jobUpdatedAt: string,
  sceneNos: number[],
  images: Record<number, { createdAt: string } | undefined>,
): RenderChanges {
  if (status?.state !== "done" || !status.finishedAt) return { script: false, scenes: [] };
  const finished = Date.parse(status.finishedAt);
  return {
    script: Date.parse(jobUpdatedAt) > finished,
    scenes: sceneNos.filter((n) => {
      const image = images[n];
      return !image || Date.parse(image.createdAt) > finished;
    }),
  };
}
