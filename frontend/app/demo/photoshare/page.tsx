"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Orb } from "@/components/brand";
import {
  ArrowRightIcon,
  CheckIcon,
  HelpIcon,
  ImageIcon,
  LockIcon,
  MonitorIcon,
  RepeatIcon,
  SparkleIcon,
  VolumeIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import type { NextStep, Skill, VerifyResult } from "@/lib/types";

type Recorded = { target: string; instruction: string; label: string };

const STEP_INFO: Record<string, { instruction: string; label: string }> = {
  "ps-open-album": { instruction: "Open the PhotoShare album", label: "Open album" },
  "ps-select-photo": { instruction: "Select the first photo", label: "Select photo" },
  "ps-add-tag": { instruction: "Add a tag to the selected photo", label: "Add tag" },
  "ps-share": { instruction: "Share the album with the family group", label: "Share album" },
};

const ALLOWED = new Set(Object.keys(STEP_INFO));

function PhotoShareDemo() {
  const searchParams = useSearchParams();
  const initialSession = searchParams.get("session_id");
  const initialLearner = searchParams.get("learner_id");
  const initialSkill = searchParams.get("skill_id");
  const requestedMode = searchParams.get("mode");

  const [mode, setMode] = useState<"practice" | "teach" | "learn">(
    initialSession ? "learn" : requestedMode === "teach" ? "teach" : "practice"
  );
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [owner, setOwner] = useState("demo-teacher");
  const [learner, setLearner] = useState(initialLearner ?? "demo-learner");
  const [title, setTitle] = useState("PhotoShare: tag and share a photo");
  const [saved, setSaved] = useState<Skill | null>(null);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSession);
  const [step, setStep] = useState<NextStep | null>(null);
  const [totalSteps, setTotalSteps] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);

  // PhotoShare app state (the "website" being taught).
  const [albumOpen, setAlbumOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [tagged, setTagged] = useState(false);
  const [shared, setShared] = useState(false);

  const stepRef = useRef<NextStep | null>(null);
  const sessionRef = useRef<string | null>(null);
  const learnerRef = useRef<string>("demo-learner");
  const completionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    learnerRef.current = learner;
  }, [learner]);

  const loadNext = useCallback(async (sid: string, who: string) => {
    const next = await api<NextStep>(
      `/api/sessions/${encodeURIComponent(sid)}/next?learner_id=${encodeURIComponent(who)}`
    );
    if (next.done) {
      setStep({ ...next, done: true });
    } else {
      setStep(next);
    }
  }, []);

  // Support opening the learner view directly from a shared link.
  useEffect(() => {
    if (!initialSession || !initialLearner) return;
    let cancelled = false;
    (async () => {
      try {
        if (initialSkill) {
          const s = await api<Skill>(
            `/api/skills/${encodeURIComponent(initialSkill)}?reader_id=${encodeURIComponent(initialLearner)}`
          );
          if (!cancelled) {
            setTotalSteps(s.steps.length);
            setActiveSkill(s);
          }
        }
        await loadNext(initialSession, initialLearner);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSession, initialLearner, initialSkill, loadNext]);

  // Real DOM highlight — not a mock screenshot.
  useEffect(() => {
    const clear = () => {
      document.querySelectorAll(".once-target").forEach((el) => el.classList.remove("once-target"));
    };
    clear();
    if (mode === "learn" && step?.target_element_id) {
      const el = document.getElementById(step.target_element_id);
      if (el) {
        el.classList.add("once-target");
      }
    }
    return clear;
  }, [mode, step]);

  function resetDemo() {
    setAlbumOpen(false);
    setSelected(false);
    setTagged(false);
    setShared(false);
    setVerdict(null);
    setStuck(false);
  }

  function resetAll() {
    resetDemo();
    setRecorded([]);
    setRecording(false);
    setSaved(null);
    setActiveSkill(null);
    setSessionId(null);
    setStep(null);
    setTotalSteps(null);
    setError(null);
    setMode("practice");
  }

  function onDemoClickCapture(e: React.MouseEvent) {
    const host = (e.target as HTMLElement).closest("[id^='ps-']");
    const clicked = host?.id ?? "none";

    if (mode === "teach" && recording && ALLOWED.has(clicked)) {
      setRecorded((prev) => {
        if (prev.some((r) => r.target === clicked)) return prev;
        const info = STEP_INFO[clicked];
        return [...prev, { target: clicked, ...info }];
      });
      return;
    }

    if (mode !== "learn") return;
    const current = stepRef.current;
    const sid = sessionRef.current;
    if (!current || current.done || current.step_order == null || !sid) return;

    if (clicked !== current.target_element_id) {
      e.preventDefault();
      e.stopPropagation();
      void verify(current.step_order, clicked);
      return;
    }
    void verify(current.step_order, clicked);
  }

  async function verify(order: number, elementId: string) {
    const sid = sessionRef.current;
    if (!sid) return;
    try {
      const result = await api<VerifyResult>(
        `/api/sessions/${encodeURIComponent(sid)}/verify?learner_id=${encodeURIComponent(
          learnerRef.current
        )}&event=click&order=${order}&element_id=${encodeURIComponent(elementId)}`,
        { method: "POST" }
      );
      setVerdict(result);
      if (result.advanced) {
        setStuck(false);
        await loadNext(sid, learnerRef.current);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveAndStart() {
    setBusy(true);
    setError(null);
    try {
      if (recorded.length === 0) throw new Error("Record at least one step first.");
      const skill = await api<Skill>("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_id: owner.trim() || "demo-teacher",
          title: title.trim() || "PhotoShare workflow",
          type: "browser_workflow",
          source: "screen_demo",
          steps: recorded.map((r, index) => ({
            order: index,
            instruction: r.instruction,
            target_element_id: r.target,
            screen: "/demo/photoshare",
            expected_event: "click",
          })),
        }),
      });
      setSaved(skill);
      setActiveSkill(skill);
      setTotalSteps(skill.steps.length);

      await api<Skill>(
        `/api/skills/${skill.skill_id}/share?owner_id=${encodeURIComponent(
          skill.owner_id
        )}&learner_id=${encodeURIComponent(learner.trim() || "demo-learner")}`,
        { method: "POST" }
      );

      const started = await api<NextStep>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skill_id: skill.skill_id,
          learner_id: learner.trim() || "demo-learner",
        }),
      });
      setSessionId(started.session_id);
      sessionRef.current = started.session_id;
      setMode("learn");
      setRecording(false);
      resetDemo();
      setVerdict({
        verdict: "verified",
        reason: `Skill saved and shared with ${learner}. Learner mode starts at step 1.`,
        advanced: false,
      });
      await loadNext(started.session_id, learner.trim() || "demo-learner");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restartSession() {
    if (!activeSkill) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api<NextStep>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill_id: activeSkill.skill_id, learner_id: learner }),
      });
      setSessionId(started.session_id);
      sessionRef.current = started.session_id;
      resetDemo();
      await loadNext(started.session_id, learner);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function repeatInstruction() {
    if (!step?.instruction) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("This browser has no speech output; the instruction is on screen.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(step.instruction);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  const shareUrl =
    saved && sessionId
      ? `/demo/photoshare?session_id=${encodeURIComponent(sessionId)}&learner_id=${encodeURIComponent(
          learner
        )}&skill_id=${encodeURIComponent(saved.skill_id)}`
      : null;

  const done = mode === "learn" && step?.done === true;
  const target = mode === "learn" ? step?.target_element_id ?? null : null;

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(
      () => completionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      200
    );
    return () => window.clearTimeout(id);
  }, [done]);
  // Resuming a session can land on a step whose controls only exist after the
  // album is open and a photo is selected. Derive the UI state instead of
  // relying on a previous page's clicks.
  const albumVisible = albumOpen || (!!target && target !== "ps-open-album");
  const photoSelected =
    selected || target === "ps-add-tag" || target === "ps-share";
  const stepNumber = (step?.step_order ?? 0) + 1;
  const total = totalSteps ?? activeSkill?.steps.length ?? 4;
  const progress = done ? 100 : Math.min(100, Math.round(((stepNumber - 1) / Math.max(total, 1)) * 100));
  const currentLabel =
    (step?.target_element_id && STEP_INFO[step.target_element_id]?.label) || "the outlined control";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-5 sm:pt-7">
        <div>
          <p className="eyebrow">Teach a browser workflow</p>
          <h1 className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.04em] sm:text-[36px]">
            PhotoShare
          </h1>
          <p className="mt-2 max-w-lg text-sm font-semibold text-muted">
            A tiny app for demonstrating real guidance: the teacher records clicks, and a second
            person gets the next step outlined in the live DOM.
          </p>
        </div>
        <Link
          href="/skills"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-extrabold text-muted hover:text-foreground"
        >
          <SparkleIcon className="size-3.5 text-accent" />
          Saved skills
        </Link>
      </div>

      <div className="hide-scrollbar mt-4 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface/70 p-1">
        {[
          { value: "practice", label: "Practice", short: "Practice" },
          { value: "teach", label: "Teach by demonstration", short: "Teach" },
          { value: "learn", label: "Guide a learner", short: "Guide" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              const next = item.value as typeof mode;
              setMode(next);
              if (next === "teach") {
                resetDemo();
                setSaved(null);
                setSessionId(null);
                setStep(null);
                setVerdict(null);
              }
              if (next === "learn" && sessionId) void loadNext(sessionId, learner);
            }}
            aria-pressed={mode === item.value}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold transition sm:px-4 ${
              mode === item.value
                ? "bg-foreground text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span className="sm:hidden">{item.short}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={resetAll}
          className="ml-auto shrink-0 rounded-full px-3 py-2 text-xs font-bold text-muted hover:text-foreground"
        >
          Reset
        </button>
      </div>

      {mode === "teach" && (
        <section className="app-card mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-warm-soft/60 to-transparent px-4 py-4 sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                {recording && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    <span className="size-1.5 animate-pulse rounded-full bg-white" />
                    Recording
                  </span>
                )}
                <h2 className="text-lg font-extrabold tracking-[-0.02em]">Record your workflow</h2>
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">
                Click real controls in the app below. Each unique click becomes a step.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecording((r) => !r);
                if (!recording) {
                  setRecorded([]);
                  resetDemo();
                }
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold text-white transition ${
                recording ? "bg-danger" : "bg-accent hover:bg-accent-deep"
              }`}
            >
              {recording ? (
                <>
                  <span className="size-2 rounded-sm bg-white" />
                  Stop recording
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-white" />
                  Start recording
                </>
              )}
            </button>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1.1fr] sm:p-5">
            <div className="rounded-[20px] border border-border bg-surface-2/60 p-3.5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                Recorded steps · {recorded.length}
              </p>
              {recorded.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-muted">
                  {recording ? "Recording — open the album to begin." : "Nothing recorded yet."}
                </p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {recorded.map((r, i) => (
                    <li
                      key={r.target}
                      className="flex items-center gap-2 rounded-full bg-surface px-2.5 py-2 text-xs font-bold"
                    >
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[9px] font-extrabold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.instruction}</span>
                      <code className="hidden text-[9px] text-muted sm:inline">#{r.target}</code>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="grid gap-2">
              <div>
                <label htmlFor="title" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  Skill title
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-bold outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="owner" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                    Owner
                  </label>
                  <input
                    id="owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="mt-1 w-full rounded-full border border-border bg-surface px-3.5 py-2.5 text-xs font-bold outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label htmlFor="learner" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                    Share with
                  </label>
                  <input
                    id="learner"
                    value={learner}
                    onChange={(e) => setLearner(e.target.value)}
                    className="mt-1 w-full rounded-full border border-border bg-surface px-3.5 py-2.5 text-xs font-bold outline-none focus:border-accent"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={saveAndStart}
                disabled={busy || recorded.length === 0}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-xs font-extrabold text-white transition hover:bg-accent-deep disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save, share & start learner"}
                {!busy && <ArrowRightIcon className="size-4" />}
              </button>
              {shareUrl && (
                <p className="break-all rounded-[14px] bg-surface-2 px-3 py-2 text-[10px] font-bold text-muted">
                  Learner link: <span className="text-accent">{shareUrl}</span>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {done && (
        <section ref={completionRef} className="relative mt-4 scroll-mt-[76px] overflow-hidden rounded-[32px] bg-[#0b1740] px-5 py-8 text-center text-white shadow-[0_30px_70px_-30px_rgba(11,23,64,0.8)] sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(77,127,255,0.42),transparent_55%)]" />
          <div className="relative">
            <Orb small />
            <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-200/80">
              Workflow complete
            </p>
            <h2 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">Well done!</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm font-semibold text-blue-100/80">
              You completed every step. Each click was verified against the real control your
              teacher recorded.
            </p>

            <div className="mx-auto mt-6 max-w-sm rounded-[22px] bg-white p-3 text-left text-foreground shadow-xl">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-accent-soft text-accent">
                  <MonitorIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">
                    {activeSkill?.title ?? "PhotoShare: tag and share a photo"}
                  </p>
                  <p className="text-[10px] font-bold text-muted">
                    {activeSkill?.steps.length ?? recorded.length} steps · completed just now
                  </p>
                </div>
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-white">
                  <CheckIcon className="size-3.5" />
                </span>
              </div>
            </div>

            <div className="mx-auto mt-5 grid max-w-sm gap-2">
              <button
                type="button"
                onClick={restartSession}
                disabled={busy || !activeSkill}
                className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-extrabold text-white transition hover:bg-accent-deep disabled:opacity-50"
              >
                <RepeatIcon className="size-4" />
                Do it again
              </button>
              <Link
                href="/"
                className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-foreground transition hover:bg-blue-50"
              >
                Back to home
              </Link>
            </div>
            {error && <p className="mt-3 text-xs font-bold text-red-200">{error}</p>}
          </div>
        </section>
      )}

      {mode === "learn" && !done && (
        <section className="app-card mt-4 overflow-hidden">
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <SparkleIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  Guiding {learner}
                </p>
                {step && !step.done && (
                  <p className="text-[10px] font-extrabold text-muted">
                    Step {stepNumber} of {total}
                  </p>
                )}
              </div>
              {step && !step.done ? (
                <>
                  <h2 className="mt-1 text-lg font-extrabold leading-snug tracking-[-0.02em] sm:text-xl">
                    {step.instruction}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    Click the outlined control in the app below. A wrong click is reported and does
                    not advance.
                  </p>
                </>
              ) : (
                <h2 className="mt-1 text-lg font-extrabold">Loading the next step…</h2>
              )}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {verdict && (
            <p
              role="status"
              className={`mx-4 mb-3 rounded-[16px] px-3.5 py-2.5 text-xs font-bold sm:mx-5 ${
                verdict.verdict === "verified"
                  ? "bg-success-soft text-[#246b48]"
                  : "bg-danger-soft text-red-700"
              }`}
            >
              {verdict.verdict === "verified" ? "✓ " : "✕ "}
              {verdict.reason}
            </p>
          )}

          {stuck && (
            <p className="mx-4 mb-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900 sm:mx-5">
              Look for the outlined control: <span className="font-extrabold">{currentLabel}</span>.
              Click it once. The step will not advance until the recorded element is clicked.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={repeatInstruction}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-2 py-2.5 text-[11px] font-extrabold transition hover:border-accent"
            >
              <VolumeIcon className="size-3.5" />
              Repeat
            </button>
            <button
              type="button"
              onClick={() => setStuck((s) => !s)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-2.5 text-[11px] font-extrabold transition ${
                stuck
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-border bg-surface hover:border-accent"
              }`}
            >
              <HelpIcon className="size-3.5" />
              I&apos;m stuck
            </button>
            <Link
              href={activeSkill ? `/skills/${activeSkill.skill_id}` : "/skills"}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-2 py-2.5 text-[11px] font-extrabold transition hover:border-accent"
            >
              <LockIcon className="size-3.5" />
              The skill
            </Link>
          </div>
        </section>
      )}

      {mode === "learn" && !sessionId && !done && (
        <section className="mt-4 rounded-[24px] border border-dashed border-accent/40 bg-accent-soft/50 px-4 py-5 text-center">
          <p className="text-sm font-extrabold">No learner session is open.</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            Open a saved browser-workflow skill, share it and start a learner session.
          </p>
          <Link
            href="/skills"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-white"
          >
            Go to My Skills
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </section>
      )}

      {(mode !== "learn" || !done) && (
        <section
          data-demo-app
          className="mt-4 scroll-mt-[76px] overflow-hidden rounded-[26px] border border-border bg-surface shadow-[0_24px_60px_-35px_rgba(63,44,22,0.55)]"
        >
          {mode === "learn" && step && !step.done && (
            <div className="flex items-center gap-2 border-b border-accent/15 bg-accent-soft/70 px-3.5 py-2.5 sm:px-4">
              <SparkleIcon className="size-3.5 shrink-0 text-accent" />
              <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-accent">
                Step {stepNumber} of {total}
              </span>
              <span className="truncate text-xs font-extrabold text-foreground">
                {step.instruction}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-border/70 bg-[#f1ece4] px-3 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-[#f28b82]" />
              <span className="size-2.5 rounded-full bg-[#fbbc76]" />
              <span className="size-2.5 rounded-full bg-[#7bcf8a]" />
            </span>
            <div className="mx-auto flex items-center gap-1.5 rounded-full bg-white/75 px-3 py-1 text-[10px] font-bold text-muted">
              <LockIcon className="size-2.5" />
              photoshare.app / family-album
            </div>
            <span className="w-8" />
          </div>

          <div
            className="grid min-h-[360px] sm:grid-cols-[150px_1fr]"
            onClickCapture={onDemoClickCapture}
          >
            <aside className="hidden border-r border-border/60 bg-[#fbf7f0] p-3 sm:block">
              <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                PhotoShare
              </p>
              <div className="mt-3 space-y-1">
                {[
                  ["Aarav", "👨🏽"],
                  ["Neha", "👩🏽"],
                  ["Family", "👨‍👩‍👧"],
                  ["Team", "🧑🏽‍💻"],
                ].map(([name, emoji], i) => (
                  <div
                    key={name}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold ${
                      i === 2 ? "bg-accent-soft text-accent" : "text-muted"
                    }`}
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-white text-sm">
                      {emoji}
                    </span>
                    {name}
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-xl bg-white/70 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-muted">
                The teacher records real clicks here. A learner gets the same app with the next
                target outlined.
              </p>
            </aside>

            <div className="p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold">Family album</h2>
                  <p className="text-[10px] font-bold text-muted">
                    {albumVisible ? "3 photos · shared moments" : "Your albums are closed"}
                  </p>
                </div>
                {shared ? (
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-extrabold text-success">
                    shared ✓
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-extrabold text-muted">
                    private
                  </span>
                )}
              </div>

              {!albumVisible ? (
                <div className="mt-4 flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-[#fdfaf5] px-4 py-10 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                    <ImageIcon className="size-5" />
                  </span>
                  <p className="mt-2 text-xs font-bold text-muted">
                    Open the album to see this weekend&apos;s photos.
                  </p>
                  <button
                    id="ps-open-album"
                    type="button"
                    onClick={() => setAlbumOpen(true)}
                    className={`${target === "ps-open-album" ? "mt-16" : "mt-7"} rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-white transition hover:bg-accent-deep`}
                  >
                    Open album
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className={`grid grid-cols-2 gap-2.5 ${target === "ps-select-photo" ? "pt-14" : ""}`}>
                    <button
                      id="ps-select-photo"
                      type="button"
                      onClick={() => setSelected(true)}
                      aria-pressed={photoSelected}
                      className={`overflow-hidden rounded-[16px] border-2 text-left transition ${
                        photoSelected
                          ? "border-accent bg-accent-soft/40"
                          : "border-border bg-white hover:border-accent/40"
                      }`}
                    >
                      <span className="flex h-24 items-center justify-center bg-gradient-to-br from-[#ffd9a8] via-[#ffb27a] to-[#b96d1d] text-4xl sm:h-28">
                        🌅
                      </span>
                      <span className="block px-2.5 py-2 text-[11px] font-extrabold">
                        Sunset at the lake {photoSelected ? "· selected" : ""}
                      </span>
                    </button>
                    <div className="overflow-hidden rounded-[16px] border border-border bg-white opacity-70">
                      <span className="flex h-24 items-center justify-center bg-gradient-to-br from-[#d9e6dc] to-[#9cb3a4] text-4xl sm:h-28">
                        🏔
                      </span>
                      <span className="block px-2.5 py-2 text-[11px] font-extrabold">
                        Mountain trail
                      </span>
                    </div>
                  </div>

                  <div className={`flex flex-wrap items-center gap-2 ${target === "ps-add-tag" || target === "ps-share" ? "pt-14" : "mt-3"}`}>
                    <button
                      id="ps-add-tag"
                      type="button"
                      onClick={() => photoSelected && setTagged(true)}
                      disabled={!photoSelected}
                      className="rounded-full border border-border bg-white px-3.5 py-2 text-[11px] font-extrabold transition hover:border-accent disabled:opacity-45"
                    >
                      {tagged ? "Tagged: family ✓" : "Add tag"}
                    </button>
                    <button
                      id="ps-share"
                      type="button"
                      onClick={() => photoSelected && setShared(true)}
                      disabled={!photoSelected}
                      className="rounded-full bg-accent px-3.5 py-2 text-[11px] font-extrabold text-white transition hover:bg-accent-deep disabled:opacity-45"
                    >
                      {shared ? "Shared ✓" : "Share album"}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-muted">
                    {photoSelected
                      ? tagged
                        ? "Photo tagged for family. Share it when ready."
                        : "Photo selected. Add a tag for the family group."
                      : "Select the photo you want to share."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[18px] border border-red-200 bg-danger-soft px-4 py-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}

      <p className="mt-4 text-center text-[10px] font-bold text-muted">
        Steps target stable element ids, so guidance survives a reload. No screenshots, no fake
        clicks.
      </p>
    </div>
  );
}

export default function PhotoShareRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
          <div className="app-card h-56 animate-pulse bg-surface/70" />
        </div>
      }
    >
      <PhotoShareDemo />
    </Suspense>
  );
}
