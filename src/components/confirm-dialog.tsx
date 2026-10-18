"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

interface Props {
  open: boolean;
  title: string;
  /** What will happen, in plain words: what is deleted, what is kept. */
  children: ReactNode;
  confirmLabel: string;
  /** Destructive actions get a red confirm button. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation built on <dialog>: focus is trapped, Esc cancels,
 * and Cancel is focused first so Enter never deletes by accident.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="font-serif text-xl">
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-raised/50 px-5 py-3">
        <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
