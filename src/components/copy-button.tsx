"use client";

import { useState } from "react";
import { Button } from "./ui";

export function CopyButton({
  text,
  label,
  variant = "primary",
  className = "h-9",
}: {
  text: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
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
    <Button variant={variant} onClick={() => void copy()} aria-live="polite" className={className}>
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
