import { cookies } from "next/headers";
import { isAllowed, SESSION_COOKIE } from "./auth.ts";

export class UnauthorizedError extends Error {}

/** Call first in every Server Action and API route: refuses requests without a valid session. */
export async function requireSession(): Promise<void> {
  const jar = await cookies();
  if (!isAllowed(jar.get(SESSION_COOKIE)?.value)) {
    throw new UnauthorizedError("Please sign in again.");
  }
}
