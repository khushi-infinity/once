"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, Logo } from "@/components/brand";
import {
  ArrowLeftIcon,
  ChatIcon,
  GridIcon,
  HomeIcon,
  SparkleIcon,
} from "@/components/icons";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/recall", label: "Ask", icon: ChatIcon, match: (p: string) => p.startsWith("/recall") },
  { href: "/skills", label: "Skills", icon: GridIcon, match: (p: string) => p.startsWith("/skills") },
  {
    href: "/alexa",
    label: "Alexa+",
    icon: SparkleIcon,
    match: (p: string) => p.startsWith("/alexa"),
  },
];

function isActive(pathname: string, href: string) {
  return NAV.find((item) => item.href === href)?.match(pathname) ?? false;
}

export function AppHeader() {
  const pathname = usePathname();
  const home = pathname === "/";
  const showBack = pathname.startsWith("/skills/");
  const backHref = "/skills";
  const [mode, setMode] = useState<string | null>(null);

  // Show the actual store mode, not a decorative "AWS" claim. Mock mode is an
  // in-memory store; live mode is DynamoDB + S3.
  useEffect(() => {
    let active = true;
    fetch("/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { app_mode?: string } | null) => {
        if (active && body?.app_mode) setMode(body.app_mode);
      })
      .catch(() => {
        // The rest of the UI already reports connection failures honestly.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border/55 bg-background/78 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-5xl items-center gap-3 px-4 sm:px-6">
        {showBack && (
          <Link
            href={backHref}
            aria-label="Go back"
            className="grid size-9 shrink-0 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
          >
            <ArrowLeftIcon className="size-5" />
          </Link>
        )}

        <Logo compact={!home} />

        <div className="ml-1 flex min-w-0 items-center gap-2">
          <span
            title={`Self-hosted MCP server for the Alexa+ simulated-experience path. Data mode: ${
              mode === "live"
                ? "live (DynamoDB + S3)"
                : mode === "mock"
                  ? "mock (in-memory seeded store)"
                  : "unknown"
            }.`}
            className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full border border-border/80 bg-surface/70 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.1em] text-muted sm:px-2.5 sm:text-[10px] sm:tracking-[0.12em]"
          >
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                mode === "live"
                  ? "bg-emerald-500"
                  : mode === "mock"
                    ? "bg-amber-500"
                    : "bg-muted/40"
              }`}
            />
            <span className="truncate">Alexa+ MCP</span>
            {mode && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] leading-none sm:text-[8px] ${
                  mode === "live"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {mode}
              </span>
            )}
          </span>
          <span className="hidden rounded-full bg-warm-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#a96822] lg:inline">
            AWS Builder
          </span>
        </div>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto md:ml-2">
          <Avatar />
        </div>
      </div>
    </header>
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/75 bg-surface/92 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[10px] font-bold transition ${
                  active ? "text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`grid size-9 place-items-center rounded-full transition ${
                    active ? "bg-accent-soft" : ""
                  }`}
                >
                  <Icon className="size-[19px]" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
