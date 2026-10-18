"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authMode,
  clearFailures,
  createSession,
  lockedOut,
  passwordMatches,
  recordFailure,
  SESSION_COOKIE,
} from "@/server/auth";

export interface LoginState {
  error?: string;
}

/** Only same-site paths, so the login page cannot be used to redirect elsewhere. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const mode = authMode();
  if (mode.kind !== "on") return { error: "No password is set. Add APP_PASSWORD to the server settings (README)." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (lockedOut(ip)) return { error: "Too many wrong attempts. Wait 15 minutes and try again." };

  const attempt = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  if (!passwordMatches(mode.password, attempt)) {
    recordFailure(ip);
    // A fixed delay makes guessing slow without bothering a real user.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "That password is not right." };
  }

  clearFailures(ip);
  const session = createSession(mode.password);
  (await cookies()).set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
