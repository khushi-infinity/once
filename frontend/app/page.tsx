"use client";

import { useEffect, useState } from "react";

type Health = { status: string; app_mode: string; version: string };

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [backend, setBackend] = useState<"checking" | "up" | "down">("checking");
  const [text, setText] = useState("");

  useEffect(() => {
    const check = () =>
      fetch("/health")
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<Health>;
        })
        .then((h) => {
          setHealth(h);
          setBackend("up");
        })
        .catch(() => setBackend("down"));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <section className="pt-10 pb-8 text-center sm:text-left">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          What would you like me to remember?
        </h1>
        <p className="mt-3 text-muted">
          Teach me anything, so it&rsquo;s there when you or someone you love needs it.
        </p>
      </section>

      <section aria-label="Teach ONCE" className="flex flex-col items-center gap-6">
        <button
          type="button"
          disabled // mic capture lands with voice teaching (Prompt 3)
          title="Voice teaching arrives with the next build"
          className="flex size-28 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden className="text-2xl">🎙</span>
          <span className="sr-only">Speak to teach</span>
        </button>

        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            // Teaching pipeline (Prompt 3) will POST the transcript to /api.
            setText(text);
          }}
        >
          <label htmlFor="teach-text" className="mb-2 block text-sm text-muted">
            Or type what you&rsquo;d like to remember
          </label>
          <textarea
            id="teach-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. Remember how I pack my bag for events…"
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted/60"
          />
        </form>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled
            className="rounded-2xl border border-border bg-surface px-4 py-4 text-left disabled:opacity-60"
          >
            <span className="text-sm font-medium">📷 Show me</span>
            <span className="mt-1 block text-xs text-muted">
              Photo or live camera
            </span>
          </button>
          <button
            type="button"
            disabled
            className="rounded-2xl border border-border bg-surface px-4 py-4 text-left disabled:opacity-60"
          >
            <span className="text-sm font-medium">🖥 Teach on screen</span>
            <span className="mt-1 block text-xs text-muted">
              Record a website task
            </span>
          </button>
          <a
            href="/skills"
            className="rounded-2xl border border-border bg-surface px-4 py-4 text-left transition hover:border-accent"
          >
            <span className="text-sm font-medium">🗂 My memories &amp; skills</span>
            <span className="mt-1 block text-xs text-muted">
              Find everything you&rsquo;ve taught ONCE
            </span>
          </a>
        </div>
      </section>

      <section aria-label="System status" className="mt-10 text-center text-xs text-muted">
        {backend === "up" && health ? (
          <span>
            ● Backend healthy — mode <strong>{health.app_mode}</strong>, v{health.version}
          </span>
        ) : backend === "down" ? (
          <span>● Backend unreachable — start it with the run commands in README.md</span>
        ) : (
          <span>● Checking backend…</span>
        )}
      </section>
    </div>
  );
}
