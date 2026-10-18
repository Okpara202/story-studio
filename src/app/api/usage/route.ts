import { getStore } from "@/server/storage";
import { collectUsage } from "@/server/usage/collect";
import { requireSession, UnauthorizedError } from "@/server/session";

/** Current free-tier usage for the Usage page and the header chip. Never cached. */
export async function GET() {
  try {
    await requireSession();
    return Response.json(await collectUsage(getStore()), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not read usage" },
      { status: err instanceof UnauthorizedError ? 401 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
