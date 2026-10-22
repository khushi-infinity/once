"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  ChatIcon,
  LockIcon,
  ShareIcon,
  SparkleIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import type { Skill, SkillType } from "@/lib/types";

const TYPE_LABEL: Record<SkillType, string> = {
  packing: "Packing list",
  checklist: "Checklist",
  household_procedure: "Household procedure",
  browser_workflow: "Browser workflow",
};

const TYPE_EMOJI: Record<SkillType, string> = {
  packing: "🧳",
  browser_workflow: "💻",
  household_procedure: "🧹",
  checklist: "🗒️",
};

function SkillDetailPage() {
  const params = useParams<{ skillId: string }>();
  const router = useRouter();
  const skillId = params.skillId;
  const [reader, setReader] = useState("demo-teacher");
  const [readerInput, setReaderInput] = useState("demo-teacher");
  const [skill, setSkill] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [learner, setLearner] = useState("demo-learner");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<Skill>(
          `/api/skills/${skillId}?reader_id=${encodeURIComponent(reader)}`
        );
        if (!cancelled) {
          setSkill(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSkill(null);
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skillId, reader, reloadKey]);

  async function share(revoke: boolean) {
    if (!skill) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await api<Skill>(
        `/api/skills/${skill.skill_id}/share?owner_id=${encodeURIComponent(skill.owner_id)}&learner_id=${encodeURIComponent(learner)}&revoke=${revoke}`,
        { method: "POST" }
      );
      setNotice(revoke ? `Revoked access for ${learner}.` : `Shared with ${learner}.`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (!skill) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const started = await api<{ session_id: string; step_order: number | null }>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill_id: skill.skill_id, learner_id: learner }),
      });
      const target = `/demo/photoshare?session_id=${encodeURIComponent(started.session_id)}&learner_id=${encodeURIComponent(learner)}&skill_id=${encodeURIComponent(skill.skill_id)}`;
      router.push(target);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-2 pt-5">
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1">
            <LockIcon className="size-3" />
            Private by default
          </span>
          {skill && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">v{skill.version}</span>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-[18px] border border-red-200 bg-danger-soft px-4 py-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-5 rounded-[18px] border border-success/25 bg-success-soft px-4 py-3 text-sm font-bold text-[#246b48]">
          {notice}
        </p>
      )}

      {!skill && !error && (
        <div className="app-card mt-6 h-48 animate-pulse bg-surface/70" aria-label="Loading skill" />
      )}

      {skill && (
        <>
          <section className="app-card mt-4 overflow-hidden">
            <div className="bg-gradient-to-b from-warm-soft/65 to-transparent px-5 pb-5 pt-6 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-surface text-[30px] shadow-sm">
                  <span aria-hidden="true">{TYPE_EMOJI[skill.type] ?? "✨"}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">Your saved method</p>
                  <h1 className="mt-1 text-[26px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[32px]">
                    {skill.title}
                  </h1>
                  <p className="mt-1.5 text-xs font-bold text-muted">
                    {TYPE_LABEL[skill.type] ?? skill.type} · {skill.items.length} items ·{" "}
                    {skill.steps.length} steps
                  </p>
                </div>
              </div>
              {skill.summary && (
                <p className="mt-4 rounded-[18px] bg-surface/80 px-4 py-3 text-sm font-semibold leading-relaxed text-foreground/85">
                  {skill.summary}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-extrabold text-muted">
                  owner {skill.owner_id}
                </span>
                <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-extrabold text-muted">
                  {skill.source.replaceAll("_", " ")}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                    skill.visibility === "shared"
                      ? "bg-accent-soft text-accent"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {skill.visibility}
                </span>
              </div>
            </div>

            <div className="grid gap-2 border-t border-border/60 p-4 sm:grid-cols-2 sm:p-5">
              <Link
                href="/recall"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-xs font-extrabold text-white transition hover:bg-accent-deep"
              >
                <ChatIcon className="size-4" />
                What am I missing?
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-3 text-xs font-extrabold transition hover:border-accent"
              >
                <SparkleIcon className="size-4 text-accent" />
                Teach something else
              </Link>
            </div>
          </section>

          {skill.type === "browser_workflow" && (
            <section className="app-card mt-4 overflow-hidden">
              <div className="flex items-start gap-3 border-b border-border/60 bg-accent-soft/45 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent">
                  <ShareIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold tracking-[-0.02em]">Guide someone else</h2>
                  <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted">
                    Share the skill, then start a session. They get the next step with a real
                    highlight — a wrong click does not advance.
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <label htmlFor="learner" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  Learner
                </label>
                <input
                  id="learner"
                  value={learner}
                  onChange={(e) => setLearner(e.target.value)}
                  className="mt-1 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-bold outline-none focus:border-accent"
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => share(false)}
                    disabled={busy}
                    className="rounded-full border border-border bg-surface px-3 py-2.5 text-xs font-extrabold transition hover:border-accent disabled:opacity-50"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => share(true)}
                    disabled={busy}
                    className="rounded-full border border-border bg-surface px-3 py-2.5 text-xs font-extrabold text-muted transition hover:border-red-300 hover:text-danger disabled:opacity-50"
                  >
                    Revoke
                  </button>
                  <button
                    type="button"
                    onClick={startSession}
                    disabled={busy}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-accent-deep disabled:opacity-50 sm:col-span-1"
                  >
                    Start session
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-[10px] font-bold text-muted">
                  Sharing is enforced server-side: the learner can read and run the skill, never edit
                  or delete it.
                </p>
              </div>
            </section>
          )}

          <section className="app-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 className="text-lg font-extrabold tracking-[-0.02em]">What I remember</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                {skill.items.length} items
              </span>
            </div>
            {skill.items.length === 0 ? (
              <p className="px-5 py-6 text-sm font-semibold text-muted">No items recorded.</p>
            ) : (
              <ul className="divide-y divide-border/55 px-2 py-1 sm:px-3">
                {skill.items.map((item, index) => (
                  <li key={item.name} className="flex items-center gap-3 px-2 py-3 sm:px-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-white">
                      <CheckIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-extrabold">{item.name}</span>
                    {item.required && (
                      <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-muted sm:inline">
                        required
                      </span>
                    )}
                    <span className="font-mono text-[10px] font-bold text-muted/70">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 className="text-lg font-extrabold tracking-[-0.02em]">How to do it</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                {skill.steps.length} steps
              </span>
            </div>
            {skill.steps.length === 0 ? (
              <p className="px-5 py-6 text-sm font-semibold text-muted">No steps recorded.</p>
            ) : (
              <ol className="space-y-2 px-3 py-3 sm:px-4">
                {skill.steps.map((step) => (
                  <li
                    key={step.order}
                    className="flex items-start gap-3 rounded-[18px] border border-border/70 bg-surface px-3 py-3"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-extrabold text-white">
                      {step.order + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-relaxed">{step.instruction}</p>
                      {step.target_element_id && (
                        <p className="mt-1 font-mono text-[10px] font-bold text-muted">
                          target: #{step.target_element_id} · {step.expected_event ?? "any event"}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="app-card-soft mt-4 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                Viewing as
              </span>
              <input
                value={readerInput}
                onChange={(e) => setReaderInput(e.target.value)}
                aria-label="View skill as"
                className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-bold outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  const next = readerInput.trim() || "demo-teacher";
                  setReader(next);
                  setReloadKey((k) => k + 1);
                }}
                className="rounded-full bg-foreground px-4 py-2 text-xs font-extrabold text-white transition hover:bg-accent"
              >
                Switch
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-muted">
              <BagIcon className="size-3" />
              Stored as {skill.skill_id} · {skill.visibility === "shared" ? "shared with you" : "only you"}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function SkillDetailRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
          <div className="app-card h-48 animate-pulse bg-surface/70" />
        </div>
      }
    >
      <SkillDetailPage />
    </Suspense>
  );
}
