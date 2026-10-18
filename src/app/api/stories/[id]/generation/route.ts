import { getStore } from "@/server/storage";
import { generationView } from "@/server/generation";
import { NotFoundError } from "@/server/jobs";
import { requireSession, UnauthorizedError } from "@/server/session";

/** Live generation status for the editor (polled every few seconds while a run is active). */
export async function GET(_req: Request, ctx: RouteContext<"/api/stories/[id]/generation">) {
  const headers = { "Cache-Control": "no-store" };
  try {
    await requireSession();
    const { id } = await ctx.params;
    return Response.json(await generationView(getStore(), id), { headers });
  } catch (err) {
    const status = err instanceof UnauthorizedError ? 401 : err instanceof NotFoundError ? 404 : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Could not read status" }, { status, headers });
  }
}
