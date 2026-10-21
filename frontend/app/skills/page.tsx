"use client";

import { useEffect, useState } from "react";

type SkillItem = { name: string; required: boolean };
type Skill = {
  skill_id: string;
  owner_id: string;
  title: string;
  type: string;
  version: number;
  visibility: string;
  summary: string | null;
  items: SkillItem[];
};

export default function SkillsPage() {
  const [readerId, setReaderId] = useState("demo-teacher");
  const [inputText, setInputText] = useState("demo-teacher");
  const [reloadKey, setReloadKey] = useState(0);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State changes only in async callbacks / event handlers — never synchronously
  // inside the effect body itself.
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
    if (error) setError(null); // event-handler state change: allowed
    if (next === readerId) {
      setReloadKey((k) => k + 1); // same reader: force refetch
    } else {
      setSkills(null);
      setReaderId(next);
    }
  };

  const loading = skills === null && error === null;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <h1 className="pt-8 text-2xl font-semibold">My memories &amp; skills</h1>
      <p className="mt-2 text-sm text-muted">
        Everything you have taught ONCE, plus skills shared with you.
      </p>

      <div className="mt-6">
        <label htmlFor="reader" className="mb-2 block text-sm">
          Viewing as
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <input
            id="reader"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="max-w-xs rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={switchReader}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Switch
          </button>
        </div>
      </div>

      {loading && <p className="mt-8 text-sm text-muted">Loading skills…</p>}

      {error && (
        <p role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {skills && skills.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          Nothing here yet. Teach ONCE something from the home page.
        </p>
      )}

      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {skills?.map((s) => (
          <li key={s.skill_id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">{s.title}</h2>
              <span className="text-xs text-muted">v{s.version}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {s.type} · {s.visibility === "shared" ? "shared" : "private"} · owner {s.owner_id}
            </p>
            {s.summary && <p className="mt-3 text-sm">{s.summary}</p>}
            {s.items.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                {s.items.map((i) => i.name).join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
