import { NextResponse, type NextRequest } from "next/server";
import { authMode, isAllowed, SESSION_COOKIE } from "@/server/auth";

/**
 * Password gate in front of every page, API route and Server Action.
 * Server Actions also check the session themselves (see requireSession),
 * so a future matcher change can never silently open them.
 */
export function proxy(request: NextRequest) {
  if (isAllowed(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const misconfigured = authMode().kind === "misconfigured";
  const isPage = request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/");
  if (isPage) {
    const url = new URL("/login", request.url);
    if (misconfigured) url.searchParams.set("setup", "1");
    else if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.json(
    { error: misconfigured ? "APP_PASSWORD is not set on the server." : "Please sign in again." },
    { status: 401 },
  );
}

export const config = {
  // Everything except the login page, Next.js assets, the icon and the static voice samples.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|voices/).*)"],
};
