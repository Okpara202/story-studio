import { r2OperationClass } from "../../shared/usage.ts";

/**
 * Cloudflare GraphQL Analytics: the authoritative numbers for R2 operations
 * and storage. Needs the "Account Analytics: Read" permission on the API token;
 * without it Cloudflare answers with an "authz" error and we report "not connected".
 */
const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export class NotAuthorizedError extends Error {}

interface GqlResponse<T> {
  data?: T | null;
  errors?: { message?: string; extensions?: { code?: string } }[] | null;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as GqlResponse<T>;
  if (body.errors?.some((e) => e.extensions?.code === "authz") || res.status === 401 || res.status === 403) {
    throw new NotAuthorizedError("The Cloudflare token cannot read analytics");
  }
  if (!res.ok || body.errors?.length || !body.data) {
    throw new Error(`Cloudflare analytics: ${body.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`}`);
  }
  return body.data;
}

type Accounts<T> = { viewer: { accounts: T[] } };

export async function r2OperationsSince(
  cfg: { token: string; accountId: string; bucket: string },
  start: Date,
  end = new Date(),
): Promise<{ classA: number; classB: number }> {
  const data = await gql<Accounts<{ r2OperationsAdaptiveGroups: { sum: { requests: number }; dimensions: { actionType: string } }[] }>>(
    cfg.token,
    `query R2Ops($accountTag: string!, $start: Time!, $end: Time!, $bucket: string!) {
      viewer { accounts(filter: { accountTag: $accountTag }) {
        r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucket }) {
          sum { requests }
          dimensions { actionType }
        }
      } }
    }`,
    { accountTag: cfg.accountId, start: start.toISOString(), end: end.toISOString(), bucket: cfg.bucket },
  );
  let classA = 0;
  let classB = 0;
  for (const g of data.viewer.accounts[0]?.r2OperationsAdaptiveGroups ?? []) {
    const cls = r2OperationClass(g.dimensions.actionType);
    if (cls === "A") classA += g.sum.requests;
    if (cls === "B") classB += g.sum.requests;
  }
  return { classA, classB };
}

/** Workers AI neurons used since `start` (today's free allowance resets at 00:00 UTC), with image counts. */
export async function aiNeuronsSince(
  cfg: { token: string; accountId: string },
  start: Date,
  end = new Date(),
): Promise<{ neurons: number; requests: number }> {
  const data = await gql<Accounts<{ aiInferenceAdaptiveGroups: { count: number; sum: { totalNeurons: number } }[] }>>(
    cfg.token,
    `query AiNeurons($accountTag: string!, $start: Time!, $end: Time!) {
      viewer { accounts(filter: { accountTag: $accountTag }) {
        aiInferenceAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
          count
          sum { totalNeurons }
        }
      } }
    }`,
    { accountTag: cfg.accountId, start: start.toISOString(), end: end.toISOString() },
  );
  let neurons = 0;
  let requests = 0;
  for (const g of data.viewer.accounts[0]?.aiInferenceAdaptiveGroups ?? []) {
    neurons += g.sum.totalNeurons;
    requests += g.count;
  }
  return { neurons: Math.round(neurons), requests };
}

export async function r2StoredBytes(cfg: { token: string; accountId: string; bucket: string }): Promise<number> {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 86_400_000);
  const data = await gql<Accounts<{ r2StorageAdaptiveGroups: { max: { payloadSize: number; metadataSize: number } }[] }>>(
    cfg.token,
    `query R2Storage($accountTag: string!, $start: Time!, $end: Time!, $bucket: string!) {
      viewer { accounts(filter: { accountTag: $accountTag }) {
        r2StorageAdaptiveGroups(limit: 1, orderBy: [datetime_DESC], filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucket }) {
          max { payloadSize metadataSize }
        }
      } }
    }`,
    { accountTag: cfg.accountId, start: start.toISOString(), end: end.toISOString(), bucket: cfg.bucket },
  );
  const row = data.viewer.accounts[0]?.r2StorageAdaptiveGroups[0];
  return row ? row.max.payloadSize + row.max.metadataSize : 0;
}
