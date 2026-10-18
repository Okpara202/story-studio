import { parseScript } from "../shared/script/parse.ts";
import type { JobStatus, OutputInfo } from "../shared/status.ts";
import { getStatus, getStory, getStyle, keys, putStatus, updateStory } from "./jobs.ts";
import { dispatchWorkflow, githubConfig, type GitHubConfig } from "./github.ts";
import type { ObjectStore } from "./storage/types.ts";

export const RENDER_WORKFLOW = "render.yml";
/** A queued run that has not reported for this long is probably stuck at GitHub. */
export const STUCK_AFTER_MS = 5 * 60_000;

/**
 * Start a cloud run: snapshot the channel style into the story, mark it queued,
 * then ask GitHub to run the worker. The worker takes over status.json from there.
 */
export type GenerationMode = "full" | "snippets";

export async function startGeneration(
  store: ObjectStore,
  id: string,
  opts: { github?: GitHubConfig; formats?: string; mode?: GenerationMode } = {},
): Promise<JobStatus> {
  const mode = opts.mode ?? "full";
  const story = await getStory(store, id);
  if (!story) throw new Error("Story not found");
  const parsed = parseScript(story.job.script);
  const errors = parsed.issues.filter((i) => i.severity === "error");
  if (errors.length) throw new Error(`Fix the script first: ${errors[0].message}`);
  if (mode === "snippets" && !story.job.snippets?.length) throw new Error("Add a snippet first.");

  const current = story.status;
  if (current && (current.state === "queued" || current.state === "running")) {
    const age = Date.now() - Date.parse(current.updatedAt);
    if (age < STUCK_AFTER_MS) throw new Error("This story is already being generated.");
  }
  // A snippets-only run keeps the finished full videos; the worker reads them from here.
  const carried: Pick<JobStatus, "outputs" | "sceneTimes"> =
    mode === "snippets" && current
      ? { outputs: current.outputs?.filter((o) => !o.snippet), sceneTimes: current.sceneTimes }
      : {};

  const github = opts.github ?? githubConfig();
  // A new run brings the files back, so the story is no longer "downloaded".
  await updateStory(store, id, { style: await getStyle(store), downloadedAt: null });
  const now = new Date().toISOString();
  const queued: JobStatus = {
    state: "queued",
    stage: null,
    progress: 0,
    message: "Waiting for a cloud worker to start",
    ...carried,
    startedAt: now,
    updatedAt: now,
  };
  await putStatus(store, id, queued);
  try {
    // "mode" is only sent when needed, so full runs also work with a workflow file that predates it.
    await dispatchWorkflow(github, RENDER_WORKFLOW, {
      job_id: id,
      formats: opts.formats ?? "16x9,9x16",
      ...(mode === "full" ? {} : { mode }),
    });
  } catch (err) {
    const failed: JobStatus = {
      ...queued,
      state: "failed",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await putStatus(store, id, failed);
    throw err;
  }
  return queued;
}

export interface OutputView extends OutputInfo {
  /** Short-lived URL for the player. */
  url: string;
  /** Short-lived URL that downloads with a friendly file name. */
  downloadUrl: string;
}

export interface GenerationView {
  status: JobStatus | null;
  outputs: OutputView[];
  /** Queued or running without any update for a while. */
  stuck: boolean;
  /** Where to look at the cloud runs on GitHub. */
  runsUrl: string | null;
}

function fileTitle(title: string): string {
  return title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "story";
}

export async function generationView(store: ObjectStore, id: string, now = Date.now()): Promise<GenerationView> {
  const [status, story] = await Promise.all([getStatus(store, id), getStory(store, id)]);
  const active = status && (status.state === "queued" || status.state === "running");
  const stuck = Boolean(active && now - Date.parse(status.updatedAt) > STUCK_AFTER_MS);
  const outputs: OutputView[] =
    status?.state === "done"
      ? await Promise.all(
          (status.outputs ?? []).map(async (o) => ({
            ...o,
            url: await store.presignGet(`${keys.jobDir(id)}${o.file}`),
            downloadUrl: await store.presignGet(`${keys.jobDir(id)}${o.file}`, {
              downloadName: `${fileTitle(story?.job.title ?? "")}${o.snippet ? `-${fileTitle(o.snippet.name)}` : ""}-${o.format}.mp4`,
            }),
          })),
        )
      : [];
  let runsUrl: string | null = null;
  try {
    runsUrl = `https://github.com/${githubConfig().repo}/actions/workflows/${RENDER_WORKFLOW}`;
  } catch {
    runsUrl = null;
  }
  return { status, outputs, stuck, runsUrl };
}
