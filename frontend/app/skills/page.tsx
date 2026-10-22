"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ChevronRightIcon,
  GridIcon,
  SearchIcon,
  SparkleIcon,
} from "@/components/icons";
import type { Skill, SkillType } from "@/lib/types";

type Filter = "all" | SkillType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "packing", label: "Packing" },
  { value: "household_procedure", label: "Home" },
  { value: "checklist", label: "Other" },
];

const TYPE_STYLE: Record<SkillType, { emoji: string; bg: string }> = {
  packing: { emoji: "🧳", bg: "bg-warm-soft" },
  browser_workflow: { emoji: "💻", bg: "bg-accent-soft" },
  household_procedure: { emoji: "🧹", bg: "bg-[#f2f7e8]" },
  checklist: { emoji: "🗒️", bg: "bg-[#f6eef8]" },
};

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Saved";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 2) return "Created just now";
  if (minutes < 60) return `Created ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Created ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Created yesterday";
  if (days < 30) return `Created ${days} days ago`;
  return `Created ${new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function SkillsPage() {
  const [readerId, setReaderId] = useState("demo-teacher");
  const [inputText, setInputText] = useState("demo-teacher");
  const [reloadKey, setReloadKey] = useState(0);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/skills?reader_id=${encodeURIComponent(readerId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(body?.detail ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ skills: Skill[] }>;
      })
      .then((b) => {
        if (!cancelled) setSkills(b.skills);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [readerId, reloadKey]);

  const switchReader = () => {
    const next = inputText.trim() || "demo-teacher";
    if (error) setError(null);
    if (next === readerId) setReloadKey((k) => k + 1);
    else {
      setSkills(null);
      setReaderId(next);
    }
  };

  const visible = useMemo(() => {
    if (!skills) return [];
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      const typeOk = filter === "all" || s.type === filter;
      if (!typeOk) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.summary ?? "").toLowerCase().includes(q) ||
        s.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [skills, filter, search]);

  const loading = skills === null && error === null;
  const demoLibrary = !!skills?.length && skills.every((s) => s.skill_id.startsWith("demo-"));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
      <section className="pt-6 sm:pt-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your memory</p>
            <h1 className="mt-1 text-[32px] font-extrabold leading-none tracking-[-0.04em] sm:text-[38px]">
              My Skills
            </h1>
            <p className="mt-2 text-sm font-semibold text-muted">
              Things you&apos;ve taught me, and skills shared with you.
            </p>
            {demoLibrary && (
              <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold text-amber-900">
                Demo library · seeded examples
              </span>
            )}
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <GridIcon className="size-5" />
          </span>
        </div>

        <div className="app-card mt-4 flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
          <SearchIcon className="size-4 shrink-0 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your skills"
            aria-label="Search your skills"
            className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-muted/65"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="rounded-full px-2 text-xs font-bold text-muted hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="hide-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-extrabold transition sm:px-4 sm:text-xs ${
                filter === f.value
                  ? "bg-accent text-white shadow-[0_8px_18px_-10px_rgba(47,107,255,0.8)]"
                  : "border border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-[18px] border border-red-200 bg-danger-soft px-4 py-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}

      {loading && (
        <div className="mt-5 space-y-3" aria-label="Loading skills">
          {[0, 1, 2].map((i) => (
            <div key={i} className="app-card h-[92px] animate-pulse bg-surface/70" />
          ))}
        </div>
      )}

      {skills && skills.length === 0 && (
        <section className="app-card mt-6 px-5 py-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-warm-soft text-[#b96d1d]">
            <SparkleIcon className="size-6" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold">Nothing here yet.</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm font-semibold text-muted">
            Teach me one thing, by voice, text or a photo, and it will live here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-extrabold text-white"
          >
            Teach your first skill
          </Link>
        </section>
      )}

      {skills && skills.length > 0 && visible.length === 0 && (
        <p className="mt-8 text-center text-sm font-semibold text-muted">
          No skills match “{search || FILTERS.find((f) => f.value === filter)?.label}”.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-[28px] border border-border bg-surface">
          {visible.map((s, index) => {
            const style = TYPE_STYLE[s.type] ?? TYPE_STYLE.checklist;
            const count =
              s.items.length > 0
                ? `${s.items.length} ${s.items.length === 1 ? "item" : "items"}`
                : `${s.steps.length} ${s.steps.length === 1 ? "step" : "steps"}`;
            return (
              <li key={s.skill_id} className={index > 0 ? "border-t border-border/55" : ""}>
                <Link
                  href={`/skills/${s.skill_id}`}
                  className="group flex items-center gap-3 px-3 py-3.5 transition hover:bg-surface-2/60 sm:px-4"
                >
                  <span
                    className={`grid size-[52px] shrink-0 place-items-center rounded-[18px] text-[25px] ${style.bg}`}
                    aria-hidden="true"
                  >
                    {style.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold leading-tight">
                      {s.title}
                      {demoLibrary && (
                        <span className="ml-1.5 align-middle rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-amber-900">
                          Example
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-bold text-muted">
                      <span className="truncate">
                        {count} · {relativeTime(s.created_at)}
                      </span>
                      {s.visibility === "shared" && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-accent">
                          Shared
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <details className="app-card-soft mt-6 p-3.5 sm:p-4">
        <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
          Developer: demo profile
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            aria-label="View skills as"
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-bold outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={switchReader}
            className="rounded-full bg-foreground px-4 py-2 text-xs font-extrabold text-white transition hover:bg-accent"
          >
            Switch
          </button>
        </div>
        <p className="mt-2 text-[10px] font-bold text-muted">
          The demo profile is not authentication. The server still checks ownership and every
          active share grant.
        </p>
      </details>
    </div>
  );
}
