"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import type { RecallResponse } from "@/lib/types";

export default function RecallPage() {
  const [reader, setReader] = useState("demo-teacher");
  const [query, setQuery] = useState("what am I missing for the conference?");
  const [found, setFound] = useState<RecallResponse | null>(null);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RecallResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true);
    setError(null);
    setFound(null);
    setResult(null);
    setHave(new Set());
    try {
      const res = await api<RecallResponse>("/api/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reader_id: reader.trim() || "demo-teacher", query, have: [] }),
      });
      setFound(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<RecallResponse>("/api/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reader_id: reader.trim() || "demo-teacher",
          query,
          have: [...have],
        }),
      });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(name: string) {
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <h1 className="pt-8 text-2xl font-semibold">What am I missing?</h1>
      <p className="mt-2 text-muted">
        ONCE answers only from skills you (or someone who shared with you) actually taught it.
        It will not invent a list.
      </p>

      <section className="mt-6 rounded-3xl border border-border bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="reader" className="block text-sm font-medium">
              Answer as
            </label>
            <input
              id="reader"
              value={reader}
              onChange={(e) => setReader(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:self-end">
            <Link href="/" className="text-sm text-accent hover:underline">
              Teach a new skill →
            </Link>
          </div>
        </div>

        <label htmlFor="query" className="mt-4 block text-sm font-medium">
          Your question
        </label>
        <input
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={find}
          disabled={busy}
          className="mt-4 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy && !found ? "Looking…" : "Find the skill"}
        </button>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        )}
      </section>

      {found && (
        <section className="mt-6 rounded-3xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Grounded in your saved memory</p>
          <h2 className="mt-1 text-xl font-semibold">{found.skill.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {found.skill.type} · v{found.skill.version} · owner {found.skill.owner_id} · matched on{" "}
            {found.matched_terms.join(", ") || "the title"}
          </p>

          <h3 className="mt-5 text-sm font-medium">
            Tick what you already have ({have.size}/{found.skill.items.length})
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {found.skill.items.map((item) => (
              <li key={item.name}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:border-accent">
                  <input
                    type="checkbox"
                    checked={have.has(item.name)}
                    onChange={() => toggle(item.name)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span>{item.name}</span>
                  {item.aliases.length > 0 && (
                    <span className="text-xs text-muted">({item.aliases.join(", ")})</span>
                  )}
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="mt-4 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Checking…" : "What's missing?"}
          </button>
        </section>
      )}

      {result && (
        <section className="mt-6 rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Not confirmed yet</h2>
          {result.missing.length === 0 ? (
            <p className="mt-2 text-sm text-green-700">
              Every required item is confirmed. You are ready to go.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {result.missing.map((item) => (
                <li key={item.name} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  {item.aliases.length > 0 && (
                    <span className="text-amber-800"> — also called {item.aliases.join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-muted">{result.explanation}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href={`/skills/${result.skill.skill_id}`} className="text-accent underline">
              Open the full skill
            </Link>
            <Link href="/" className="text-accent underline">
              Add or fix items
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
