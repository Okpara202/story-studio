"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { createStoryAction } from "../actions";

export { CopyButton } from "@/components/copy-button";

export function UseExampleButton({ script }: { script: string }) {
  const [pending, start] = useTransition();
  return (
    <Button onClick={() => start(() => createStoryAction(script))} disabled={pending} className="h-9">
      {pending ? "Creating…" : "Start a story from it"}
    </Button>
  );
}
