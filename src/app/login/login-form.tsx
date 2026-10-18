"use client";

import { useActionState, useState } from "react";
import { Button, Card } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next, setup }: { next: string; setup: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [visible, setVisible] = useState(false);

  return (
    <Card className="w-full max-w-sm p-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-control border border-accent/50 font-serif text-accent"
        >
          S
        </span>
        <span className="font-serif text-xl">Story Studio</span>
      </div>

      {setup ? (
        <div role="alert" className="mt-6 space-y-2 text-sm">
          <p className="font-medium text-danger">The app is locked because no password is set.</p>
          <p className="text-muted">
            Add <code className="font-mono text-ink">APP_PASSWORD</code> in Vercel → Project → Settings → Environment
            Variables, then redeploy. See the README.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                autoFocus
                spellCheck={false}
                aria-invalid={Boolean(state.error)}
                aria-describedby={state.error ? "login-error" : undefined}
                className="w-full rounded-control border border-line bg-raised py-2 pl-3 pr-11 text-sm focus:border-accent/60 focus:outline-none aria-invalid:border-danger/70"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                aria-controls="password"
                title={visible ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-control text-muted transition hover:text-ink"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {visible && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>
          </div>
          {state.error && (
            <p id="login-error" role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {pending ? "Checking…" : "Sign in"}
          </Button>
          <p className="text-xs text-muted">This browser stays signed in for 30 days.</p>
        </form>
      )}

      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-muted">
        Contact{" "}
        <a
          href="mailto:okparafavour202@gmail.com?subject=Story%20Studio%20access"
          className="text-accent underline-offset-4 hover:underline"
        >
          okparafavour202@gmail.com
        </a>{" "}
        to use the app.
      </p>
    </Card>
  );
}
