"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { createStoryAction } from "../actions";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Older browsers, or a page without focus: copy through a temporary text box.
      setState(legacyCopy(text) ? "copied" : "failed");
    }
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button variant="primary" onClick={() => void copy()} aria-live="polite" className="h-9">
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy manually" : label}
    </Button>
  );
}

function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function UseExampleButton({ script }: { script: string }) {
  const [pending, start] = useTransition();
  return (
    <Button onClick={() => start(() => createStoryAction(script))} disabled={pending} className="h-9">
      {pending ? "Creating…" : "Start a story from it"}
    </Button>
  );
}
