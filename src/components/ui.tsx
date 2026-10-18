import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { StoryStatus } from "@/shared/status";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 disabled:bg-raised disabled:text-muted",
  secondary: "border border-line bg-raised text-ink hover:border-muted disabled:text-muted",
  ghost: "text-muted hover:bg-raised hover:text-ink disabled:opacity-50",
  danger: "border border-line text-danger hover:border-danger disabled:opacity-50",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 h-10 text-sm font-medium transition disabled:cursor-not-allowed";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-card border border-line bg-surface ${className}`} {...props} />;
}

const STATUS: Record<StoryStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted border-line" },
  generating: { label: "Generating", className: "text-info border-info/40" },
  ready: { label: "Ready", className: "text-success border-success/40" },
  failed: { label: "Failed", className: "text-danger border-danger/40" },
  downloaded: { label: "Downloaded", className: "text-accent border-accent/40" },
};

export function StatusChip({ status }: { status: StoryStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${s.className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export const STATUS_LABELS: Record<StoryStatus, string> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<StoryStatus, string>;

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-mono text-[11px] uppercase tracking-[0.14em] text-muted ${className}`}>{children}</h2>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-14 text-center">
      <svg aria-hidden viewBox="0 0 48 48" className="mb-5 size-12 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="9" y="6" width="30" height="36" rx="2" />
        <path d="M15 15h18M15 21h18M15 27h11" strokeLinecap="round" />
        <circle cx="33" cy="34" r="5" />
        <path d="m36.5 37.5 3.5 3.5" strokeLinecap="round" />
      </svg>
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-2 max-w-md text-sm text-muted">{children}</div>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const SPEAKER_COLORS = ["#C9A45C", "#7C93B8", "#9C7FB0", "#6F9E7A", "#B07A5C", "#8AA3A0"];

export function speakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}
