"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">
        The app could not load your data. If this keeps happening, check that storage is set up (README → Cloudflare
        R2) and that your internet connection works.
      </p>
      {/* In development the real message helps; in production Next.js hides it and shows a reference id. */}
      <pre className="mt-6 overflow-x-auto rounded-control border border-line bg-surface p-3 text-left font-mono text-xs text-muted">
        {error.digest ? `Reference: ${error.digest}` : error.message}
      </pre>
      <Button variant="primary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
