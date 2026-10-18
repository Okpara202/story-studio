"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Stories", icon: "M4 5h16M4 12h16M4 19h10" },
  { href: "/usage", label: "Usage", icon: "M4 19h16M7 15V9m5 6V5m5 10v-3" },
  {
    href: "/settings",
    label: "Style",
    icon: "M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" || pathname.startsWith("/stories") : pathname.startsWith(href);
}

const STYLES = {
  top: "rounded-control px-3 py-1.5 text-sm text-muted transition hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink",
  bottom:
    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted aria-[current=page]:text-accent",
};

/** Pass `pathname={null}` for the static fallback rendered before the URL is known. */
export function NavLinks({ variant, pathname }: { variant: "top" | "bottom"; pathname?: string | null }) {
  return pathname === undefined ? <LiveNavLinks variant={variant} /> : <Links variant={variant} pathname={pathname} />;
}

function LiveNavLinks({ variant }: { variant: "top" | "bottom" }) {
  return <Links variant={variant} pathname={usePathname()} />;
}

function Links({ variant, pathname }: { variant: "top" | "bottom"; pathname: string | null }) {
  return NAV.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive(pathname, item.href) ? "page" : undefined}
      className={STYLES[variant]}
    >
      {variant === "bottom" && (
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d={item.icon} />
        </svg>
      )}
      {item.label}
    </Link>
  ));
}
