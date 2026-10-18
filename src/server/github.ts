/**
 * Starts and inspects cloud runs (GitHub Actions workflow_dispatch).
 * Needs GITHUB_TOKEN (fine-grained: Actions read/write on this repo only)
 * and GITHUB_REPO ("owner/name").
 */
const API = "https://api.github.com";

export class GitHubConfigError extends Error {}

export interface GitHubConfig {
  token: string;
  repo: string;
  /** Branch whose workflow file runs. */
  ref: string;
}

export function githubConfig(env: Record<string, string | undefined> = process.env): GitHubConfig {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO;
  if (!token || !repo) {
    throw new GitHubConfigError("Cloud rendering is not set up: add GITHUB_TOKEN and GITHUB_REPO (see setup notes).");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new GitHubConfigError(`GITHUB_REPO must look like owner/name, got "${repo}"`);
  return { token, repo, ref: env.GITHUB_REF_NAME || "main" };
}

async function gh(cfg: GitHubConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}/repos/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) throw new GitHubConfigError("GitHub rejected the token (expired or revoked). Create a new one.");
  if (res.status === 403 || res.status === 404) {
    const body = await res.text();
    throw new GitHubConfigError(
      `GitHub refused (${res.status}). Check that the token has "Actions: Read and write" on ${cfg.repo} and the workflow file exists. ${body.slice(0, 200)}`,
    );
  }
  return res;
}

/** Start a workflow (by file name, e.g. "render.yml") with string inputs. */
export async function dispatchWorkflow(cfg: GitHubConfig, workflow: string, inputs: Record<string, string>): Promise<void> {
  const res = await gh(cfg, `/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: cfg.ref, inputs }),
  });
  if (res.status !== 204 && !res.ok) {
    throw new Error(`GitHub did not start the workflow (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  /** The run title, which our workflows set to include the story id. */
  title: string;
}

/** Recent runs of a workflow, newest first. */
export async function listRuns(cfg: GitHubConfig, workflow: string, perPage = 10): Promise<WorkflowRun[]> {
  const res = await gh(cfg, `/actions/workflows/${workflow}/runs?per_page=${perPage}`);
  const body = (await res.json()) as {
    workflow_runs?: {
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      display_title: string;
    }[];
  };
  return (body.workflow_runs ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    title: r.display_title,
  }));
}
