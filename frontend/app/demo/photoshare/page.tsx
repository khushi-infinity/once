"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

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
  const [mode, setMode] = useState<"practice" | "teach" | "learn">(
    initialSession ? "learn" : "practice"
  );
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const [owner, setOwner] = useState("demo-teacher");
  const [learner, setLearner] = useState(initialLearner ?? "demo-learner");
  const [title, setTitle] = useState("PhotoShare: tag and share a photo");
  const [saved, setSaved] = useState<Skill | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSession);
  const [step, setStep] = useState<NextStep | null>(null);
  const [totalSteps, setTotalSteps] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // PhotoShare app state (the "website" being taught).
  const [albumOpen, setAlbumOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [tagged, setTagged] = useState(false);
  const [shared, setShared] = useState(false);

  const stepRef = useRef<NextStep | null>(null);
  const sessionRef = useRef<string | null>(null);
  const learnerRef = useRef<string>("demo-learner");

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
          if (!cancelled) setTotalSteps(s.steps.length);
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
        el.scrollIntoView({ behavior: "smooth", block: "center" });
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
  }

  function resetAll() {
    resetDemo();
    setRecorded([]);
    setRecording(false);
    setSaved(null);
    setSessionId(null);
    setStep(null);
    setVerdict(null);
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

  const shareUrl =
    saved && sessionId
      ? `/demo/photoshare?session_id=${encodeURIComponent(sessionId)}&learner_id=${encodeURIComponent(
          learner
        )}&skill_id=${encodeURIComponent(saved.skill_id)}`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-8">
        <div>
          <h1 className="text-2xl font-semibold">PhotoShare</h1>
          <p className="mt-1 text-sm text-muted">
            A tiny photo app used to demonstrate teaching a browser workflow and guiding a second
            person with a real highlight.
          </p>
        </div>
        <Link href="/skills" className="text-sm text-accent hover:underline">
          See saved skills →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("practice");
            setRecording(false);
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            mode === "practice" ? "bg-accent text-white" : "border border-border"
          }`}
        >
          Practice
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("teach");
            resetDemo();
            setSaved(null);
            setSessionId(null);
            setStep(null);
            setVerdict(null);
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            mode === "teach" ? "bg-accent text-white" : "border border-border"
          }`}
        >
          Teach by demonstration
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("learn");
            if (sessionId) void loadNext(sessionId, learner);
          }}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            mode === "learn" ? "bg-accent text-white" : "border border-border"
          }`}
        >
          Learner mode
        </button>
        <button type="button" onClick={resetAll} className="ml-auto text-sm text-muted hover:text-foreground">
          Reset all
        </button>
      </div>

      {mode === "teach" && (
        <section className="mt-4 rounded-3xl border border-accent/40 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Record the workflow</h2>
            <button
              type="button"
              onClick={() => {
                setRecording((r) => !r);
                if (!recording) setRecorded([]);
                resetDemo();
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${
                recording ? "bg-red-600" : "bg-accent"
              }`}
            >
              {recording ? "■ Stop recording" : "● Start recording"}
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">
            Click through the app below. Each click on a real control becomes a step.
          </p>
          {recorded.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {recording ? "Recording — open the album to begin." : "Nothing recorded yet."}
            </p>
          ) : (
            <ol className="mt-3 space-y-1 text-sm">
              {recorded.map((r, i) => (
                <li key={r.target} className="rounded-lg bg-accent-soft px-3 py-2">
                  {i + 1}. {r.instruction}{" "}
                  <span className="font-mono text-xs text-muted">#{r.target}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className="block text-sm font-medium">
                Skill title
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="owner" className="block text-sm font-medium">
                Owner
              </label>
              <input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="learner" className="block text-sm font-medium">
                Share with learner
              </label>
              <input
                id="learner"
                value={learner}
                onChange={(e) => setLearner(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="self-end">
              <button
                type="button"
                onClick={saveAndStart}
                disabled={busy || recorded.length === 0}
                className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save, share & start learner"}
              </button>
            </div>
          </div>
          {shareUrl && (
            <p className="mt-3 text-sm">
              Learner link:{" "}
              <a href={shareUrl} className="break-all text-accent underline">
                {shareUrl}
              </a>
            </p>
          )}
        </section>
      )}

      {mode === "learn" && (
        <section className="mt-4 rounded-3xl border border-accent/40 bg-surface p-5">
          {step?.done ? (
            <>
              <h2 className="font-semibold text-green-700">Workflow complete.</h2>
              <p className="mt-1 text-sm text-muted">
                Every step was verified against the real DOM element the teacher recorded.
              </p>
              <Link href="/skills" className="mt-3 inline-block text-sm text-accent underline">
                Open the saved skill
              </Link>
            </>
          ) : step ? (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">
                Step {(step.step_order ?? 0) + 1}
                {totalSteps ? ` of ${totalSteps}` : ""} · learner {learner}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{step.instruction}</h2>
              <p className="mt-1 text-sm text-muted">
                The real control is outlined in the app below. Click the outlined control; a wrong
                click is reported and does not advance.
              </p>
              <p className="mt-2 font-mono text-xs text-muted">target #{step.target_element_id}</p>
            </>
          ) : (
            <p className="text-sm text-muted">Loading the next step…</p>
          )}

          {verdict && (
            <p
              role="status"
              className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                verdict.verdict === "verified"
                  ? "border border-green-200 bg-green-50 text-green-800"
                  : "border border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {verdict.verdict === "verified" ? "✓ " : "✕ "}
              {verdict.reason}
            </p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section
        className="mt-5 rounded-3xl border border-border bg-surface p-5"
        onClickCapture={onDemoClickCapture}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Family album</h2>
          {shared && <span className="text-xs text-green-700">shared ✓</span>}
        </div>

        {!albumOpen ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted">Your albums are closed.</p>
            <button
              id="ps-open-album"
              type="button"
              onClick={() => setAlbumOpen(true)}
              className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Open album
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                id="ps-select-photo"
                type="button"
                onClick={() => setSelected(true)}
                aria-pressed={selected}
                className={`overflow-hidden rounded-xl border-2 text-left ${
                  selected ? "border-accent" : "border-border"
                }`}
              >
                <span className="flex h-24 items-center justify-center bg-accent-soft text-3xl" aria-hidden>
                  🌅
                </span>
                <span className="block px-3 py-2 text-sm">
                  Sunset at the lake {selected ? "· selected" : ""}
                </span>
              </button>
              <div className="overflow-hidden rounded-xl border border-border opacity-60">
                <span className="flex h-24 items-center justify-center bg-background text-3xl" aria-hidden>
                  🏔
                </span>
                <span className="block px-3 py-2 text-sm">Mountain trail</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                id="ps-add-tag"
                type="button"
                onClick={() => selected && setTagged(true)}
                disabled={!selected}
                className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
              >
                {tagged ? "Tagged: family ✓" : "Add tag"}
              </button>
              <button
                id="ps-share"
                type="button"
                onClick={() => selected && setShared(true)}
                disabled={!selected}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {shared ? "Shared ✓" : "Share album"}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              {selected
                ? tagged
                  ? "Photo tagged for family. Share it when ready."
                  : "Photo selected. Add a tag for the family group."
                : "Select the photo you want to share."}
            </p>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-muted">
        This is the controlled demo site referenced by the browser-workflow skill. Steps target
        stable element ids, so guidance survives a reload.
      </p>
    </div>
  );
}

export default function PhotoShareRoute() {
  return (
    <Suspense
      fallback={<p className="mx-auto max-w-3xl px-6 pt-8 text-sm text-muted">Loading PhotoShare…</p>}
    >
      <PhotoShareDemo />
    </Suspense>
  );
}
