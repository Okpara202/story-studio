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

export type Platform = "shorts" | "reels" | "tiktok";

export interface PlatformPost {
  platform: Platform;
  label: string;
  /** Suggested caption; worded differently per app so posts aren't identical copies. */
  caption: string;
  checklist: ChecklistItem[];
}

const AI_LABEL: ChecklistItem = {
  id: "ai-label",
  label: "Said Yes to the AI / synthetic content question",
  hint: "Each app asks in its own words at upload. Realistic AI voices and images need the label.",
};

/**
 * Captions and steps for the short-video apps, for one teaser (or the full
 * vertical video when `teaser` is omitted). Plain suggestions: nothing is posted.
 */
export function platformPosts(parsed: ParsedStory, teaser?: { name: string }): PlatformPost[] {
  const title = parsed.title || "Untitled story";
  const hook = hookOf(parsed, 150);
  const lead = teaser ? hook : `${title}. ${hook}`;
  return [
    {
      platform: "shorts",
      label: "YouTube Shorts",
      caption: `${lead} Full story on the channel. #shorts #mystery #horrorstory`,
      checklist: [
        { id: "shorts-related", label: "Linked the full video", hint: "Set 'Related video' to the full 16:9 story at upload." },
        AI_LABEL,
        { id: "shorts-title", label: "Changed a few words of the caption", hint: "Don't post identical text everywhere." },
      ],
    },
    {
      platform: "reels",
      label: "Facebook Reels",
      caption: `${lead}\n\nThe full story is on YouTube (link in the comments). #mystery #scarystories`,
      checklist: [
        { id: "reels-comment", label: "Posted the full-video link as the first comment" },
        AI_LABEL,
        { id: "reels-original", label: "Uploaded the file from here", hint: "Never a download from another app; those carry watermarks." },
      ],
    },
    {
      platform: "tiktok",
      label: "TikTok",
      caption: `${lead} Full story: link in bio. #mystery #horrortok #storytime`,
      checklist: [
        { id: "tiktok-bio", label: "The full video is linked in the bio or a pinned comment" },
        { ...AI_LABEL, hint: "Turn on 'AI-generated content' in the upload settings." },
        { id: "tiktok-original", label: "Uploaded the file from here", hint: "Never a download from another app; those carry watermarks." },
      ],
    },
  ];
}

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
