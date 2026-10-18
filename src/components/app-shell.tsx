import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { NavLinks } from "./nav-links";
import { UsageChip } from "./usage-chip";
import { authMode } from "@/server/auth";
import { logoutAction } from "@/app/login/actions";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-control border border-accent/50 font-serif text-sm text-accent"
            >
              S
            </span>
            <span className="font-serif text-lg tracking-tight">Story Studio</span>
          </Link>
          <nav aria-label="Main" className="hidden gap-1 sm:flex">
            {/* The active state needs the URL, which is only known per request. */}
            <Suspense fallback={<NavLinks variant="top" pathname={null} />}>
              <NavLinks variant="top" />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <UsageChip />
            <ThemeToggle />
            {authMode().kind === "on" && (
              <form action={logoutAction}>
                <button
                  type="submit"
                  title="Sign out of this browser"
                  className="rounded-control px-2.5 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-ink"
                >
                  Log out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pb-20 sm:pb-0">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur sm:hidden"
      >
        <Suspense fallback={<NavLinks variant="bottom" pathname={null} />}>
          <NavLinks variant="bottom" />
        </Suspense>
      </nav>
    </div>
  );
}
