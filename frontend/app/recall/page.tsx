"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  ChatIcon,
  HelpIcon,
  MicIcon,
  SparkleIcon,
} from "@/components/icons";
import { Orb } from "@/components/brand";
import { api } from "@/lib/api";
import type { RecallResponse } from "@/lib/types";

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export default function RecallPage() {
  const [reader, setReader] = useState("demo-teacher");
  const [query, setQuery] = useState("what am I missing for the conference?");
  const [quick, setQuick] = useState("");
  const [found, setFound] = useState<RecallResponse | null>(null);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RecallResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find(text?: string) {
    const nextQuery = (text ?? query).trim();
    if (nextQuery.length < 3) {
      setError("Ask me a little more first.");
      return;
    }
    setQuery(nextQuery);
    setQuick("");
    setBusy(true);
    setError(null);
    setFound(null);
    setResult(null);
    setHave(new Set());
    try {
      const res = await api<RecallResponse>("/api/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reader_id: reader.trim() || "demo-teacher", query: nextQuery, have: [] }),
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
          query: found.query,
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

  function dictate() {
    if (listening) return;
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser has no speech recognition. Type your question instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) setQuery(transcript.trim());
    };
    rec.onerror = (event) => {
      setError(`Microphone error: ${event.error}. You can type instead.`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }

  const notConfirmedCount = result?.not_confirmed.length ?? 0;
  const items = found?.skill.items ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
      <section className="relative overflow-hidden pt-6 sm:pt-9">
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_150px]">
          <div>
            <p className="eyebrow">Ask your memory</p>
            <h1 className="mt-1 text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[38px]">
              What am I
              <br className="sm:hidden" /> missing?
            </h1>
            <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed text-muted">
              I answer only from skills you actually taught me. If it isn&apos;t stored, I&apos;ll
              say so, I won&apos;t invent a list.
            </p>
          </div>
          <div className="hidden sm:block">
            <Orb small />
          </div>
        </div>
      </section>

      <section className="app-card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <ChatIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Asking as <span className="text-foreground">You</span>
          </span>
          <details className="relative">
            <summary className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted">
              Developer
            </summary>
            <div className="mt-2 flex items-center gap-2 rounded-[14px] border border-border bg-surface p-2">
              <label htmlFor="demo-reader" className="text-[10px] font-extrabold text-muted">
                Demo profile
              </label>
              <input
                id="demo-reader"
                value={reader}
                onChange={(e) => setReader(e.target.value)}
                title="Demo identity, not authentication. Server-side ownership and share checks are real."
                className="min-w-0 flex-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-extrabold outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </details>
        </div>

        <div className="bg-gradient-to-b from-accent-soft/60 to-transparent p-4 sm:p-5">
          <div className="relative ml-0 max-w-[92%] rounded-[24px] rounded-bl-md border border-border bg-surface px-4 py-3 shadow-sm">
            <label htmlFor="query" className="sr-only">
              Your question
            </label>
            <textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={2}
              placeholder="I'm going for an event. I have water bottle, pen and charger. What more do I need?"
              className="w-full resize-none bg-transparent text-sm font-semibold leading-relaxed outline-none placeholder:text-muted/60"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void find()}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(47,107,255,0.8)] transition hover:bg-accent-deep disabled:opacity-50 sm:flex-none"
            >
              <SparkleIcon className="size-4" />
              {busy && !found ? "Checking my memory…" : "Ask ONCE"}
            </button>
            <button
              type="button"
              onClick={dictate}
              aria-pressed={listening}
              className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${
                listening
                  ? "border-danger bg-danger text-white"
                  : "border-border bg-surface text-accent hover:border-accent"
              }`}
              aria-label={listening ? "Listening" : "Ask by voice"}
            >
              <MicIcon className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
        >
          {error}
        </p>
      )}

      {found && (
        <section className="app-card mt-5 overflow-hidden">
          <div className="flex items-start gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-warm-soft text-[#b96d1d]">
              <BagIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Grounded in your saved skill</p>
              <h2 className="mt-0.5 text-lg font-extrabold leading-tight tracking-[-0.02em]">
                Based on “{found.skill.title}”, here&apos;s what to check:
              </h2>
              <p className="mt-1 text-xs font-semibold text-muted">
                Tick what you have. Anything left unticked is <strong>not confirmed</strong>, not
                proof that it is absent.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border/50 px-2 sm:px-3">
            {items.map((item) => {
              const isHave = have.has(item.name);
              const isNotConfirmed =
                result?.not_confirmed.some((m) => m.name === item.name) ?? false;
              return (
                <li key={item.name}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-surface-2/70 sm:px-3">
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${
                        isHave
                          ? "border-success bg-success text-white"
                          : "border-border bg-surface text-transparent"
                      }`}
                    >
                      <CheckIcon className="size-3.5" />
                    </span>
                    <input
                      type="checkbox"
                      checked={isHave}
                      onChange={() => toggle(item.name)}
                      className="sr-only"
                    />
                    <span className="min-w-0 flex-1 text-sm font-extrabold">{item.name}</span>
                    {result ? (
                      isHave ? (
                        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-success">
                          Packed
                        </span>
                      ) : isNotConfirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warm-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#a96822]">
                          <HelpIcon className="size-3" />
                          Not confirmed
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                          Not visible
                        </span>
                      )
                    ) : item.required ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
                        required
                      </span>
                    ) : null}
                    {!result && (
                      <span className="grid size-6 place-items-center rounded-full border border-border text-transparent">
                        <CheckIcon className="size-3" />
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border/60 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={check}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-extrabold text-white transition hover:bg-accent disabled:opacity-50"
            >
              {busy ? "Checking…" : "Check my list"}
              {!busy && <ArrowRightIcon className="size-4" />}
            </button>
            <p className="mt-2 text-center text-[10px] font-bold text-muted">
              Tick what you already have. Unconfirmed is never treated as proof of absence.
            </p>
          </div>
        </section>
      )}

      {result && (
        <section
          className={`mt-4 rounded-[26px] border p-4 sm:p-5 ${
            notConfirmedCount === 0
              ? "border-success/25 bg-success-soft"
              : "border-warm/45 bg-surface"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-full ${
                notConfirmedCount === 0
                  ? "bg-success text-white"
                  : "bg-warm-soft text-[#a96822]"
              }`}
            >
              {notConfirmedCount === 0 ? (
                <CheckIcon className="size-5" />
              ) : (
                <HelpIcon className="size-5" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-[-0.02em]">
                {notConfirmedCount === 0
                  ? "Everything on this list is confirmed."
                  : `${notConfirmedCount} required ${notConfirmedCount === 1 ? "item is" : "items are"} not confirmed.`}
              </h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-muted">
                {result.explanation}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/skills/${result.skill.skill_id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-xs font-extrabold text-white"
            >
              <BagIcon className="size-3.5" />
              Open the full skill
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-extrabold text-foreground"
            >
              Teach another skill
            </Link>
          </div>
        </section>
      )}

      {!found && !error && (
        <section className="mx-auto mt-8 max-w-md text-center">
          <div className="flex justify-center gap-2">
            <span className="h-1.5 w-10 rounded-full bg-warm/60" />
            <span className="h-1.5 w-6 rounded-full bg-accent/30" />
            <span className="h-1.5 w-3 rounded-full bg-border" />
          </div>
          <p className="mt-3 text-xs font-bold text-muted">
            Try “What am I missing for the conference?” or “What do I need for my tea?”
          </p>
        </section>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void find(quick);
        }}
        className="app-card mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-full py-1.5 pl-2 pr-1.5"
      >
        <button
          type="button"
          onClick={dictate}
          aria-label="Ask by voice"
          className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
            listening ? "bg-danger text-white" : "bg-accent-soft text-accent"
          }`}
        >
          <MicIcon className="size-4" />
        </button>
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Ask anything…"
          aria-label="Ask anything"
          className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-muted/65"
        />
        <button
          type="submit"
          aria-label="Send question"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-white transition hover:bg-accent"
        >
          <ArrowRightIcon className="size-4" />
        </button>
      </form>
    </div>
  );
}
