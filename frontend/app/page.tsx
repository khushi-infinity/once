"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ArrowRightIcon,
  BagIcon,
  CameraIcon,
  CheckIcon,
  ImageIcon,
  MicIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SparkleIcon,
  XIcon,
} from "@/components/icons";
import { Orb } from "@/components/brand";
import { api, engineLabel } from "@/lib/api";
import type { Draft, Skill, SkillSource, SkillStep, SkillType } from "@/lib/types";

type Mode = "text" | "voice" | "photo";

type RecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike };
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionLike;

const SKILL_TYPES: { value: SkillType; label: string }[] = [
  { value: "packing", label: "Packing list" },
  { value: "checklist", label: "Checklist" },
  { value: "household_procedure", label: "Household procedure" },
  { value: "browser_workflow", label: "Browser workflow" },
];

const PROMPTS = [
  "I pack for a conference with my laptop, charger, HDMI adapter, badge and water bottle…",
  "My tea ritual: boil water, warm the cup, add one spoon of leaves, steep three minutes…",
  "On PhotoShare I open the album, pick a photo, add a family tag and share it…",
];

function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: 22 }).map((_, i) => (
        <span key={i} className="wave-bar" style={{ animationDelay: `${(i % 7) * 0.09}s` }} />
      ))}
    </div>
  );
}

export default function TeachPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [skillType, setSkillType] = useState<SkillType>("packing");
  const [owner, setOwner] = useState("demo-teacher");
  const [text, setText] = useState("");
  const [quickText, setQuickText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Skill | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const previewRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLElement | null>(null);
  const draftRef = useRef<HTMLElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  // A draft taught through /alexa is handed off here so "review and save"
  // opens the real draft instead of an empty form.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("once:pending-draft");
    } catch {
      return;
    }
    if (!raw) return;
    let pending: { transcript?: string; draft?: Draft } | null = null;
    try {
      pending = JSON.parse(raw) as { transcript?: string; draft?: Draft };
    } catch {
      pending = null;
      try {
        sessionStorage.removeItem("once:pending-draft");
      } catch {
        // Nothing else to do.
      }
    }
    if (!pending?.draft || !Array.isArray(pending.draft.items)) return;

    const handoff = pending.draft;
    const transcript = pending.transcript ?? "";
    // Defer the handoff to the next task: this reads an external store once,
    // and avoids a synchronous cascading render during mount. Remove the key
    // inside the timer so React StrictMode's mount/cleanup/mount cycle still
    // sees the handoff on its second pass.
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem("once:pending-draft");
      } catch {
        // Nothing else to do.
      }
      setDraft(handoff);
      setText(transcript);
      setMode("text");
      window.requestAnimationFrame(() => {
        draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [listening]);

  useEffect(() => {
    if (draft) {
      window.setTimeout(
        () => draftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120
      );
    }
  }, [draft]);

  function scrollToComposer() {
    window.setTimeout(
      () => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      30
    );
  }

  function toggleVoice() {
    setVoiceError(null);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceError(
        "This browser has no speech recognition. Chrome, Edge and Safari support it over https or localhost; typing and photos still work."
      );
      setMode("voice");
      scrollToComposer();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) {
        setText((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${finalText.trim()}`);
      }
      setInterim(interimText);
    };
    rec.onerror = (event) => {
      setVoiceError(`Microphone error: ${event.error}. You can type instead.`);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setSeconds(0);
    setMode("voice");
  }

  function startTalk() {
    setMode("voice");
    scrollToComposer();
    if (!listening) toggleVoice();
  }

  function startPhoto() {
    setMode("photo");
    scrollToComposer();
    window.setTimeout(() => photoInputRef.current?.click(), 300);
  }

  function pickFile(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(next);
    if (next) {
      const url = URL.createObjectURL(next);
      previewRef.current = url;
      setPreview(url);
      setMode("photo");
    } else {
      setPreview(null);
    }
  }

  async function extract(opts?: { text?: string; mode?: Mode }) {
    setError(null);
    setSaved(null);
    const activeMode = opts?.mode ?? mode;
    const input = (opts?.text ?? text).trim();
    const source: SkillSource =
      activeMode === "voice" ? "voice" : activeMode === "photo" ? "photo" : "text";
    setBusy("extract");
    try {
      let next: Draft;
      if (source === "photo") {
        if (!file) throw new Error("Choose a photo first.");
        const form = new FormData();
        form.append("file", file);
        form.append("note", note);
        form.append("skill_type", skillType);
        next = await api<Draft>("/api/teach/extract-image", { method: "POST", body: form });
      } else {
        if (input.length < 3) throw new Error("Tell ONCE a little more first.");
        next = await api<Draft>("/api/teach/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript: input, skill_type: skillType, source }),
        });
      }
      setDraft(next);
      setMode(activeMode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function submitQuick(e: React.FormEvent) {
    e.preventDefault();
    const raw = quickText.trim();
    if (!raw) {
      setMode("text");
      scrollToComposer();
      window.setTimeout(() => textRef.current?.focus(), 400);
      return;
    }
    setText(raw);
    setQuickText("");
    void extract({ text: raw, mode: "text" });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    setBusy("save");
    const source: SkillSource = mode === "voice" ? "voice" : mode === "photo" ? "photo" : "text";
    try {
      const skill = await api<Skill>("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_id: owner.trim() || "demo-teacher",
          title: draft.title.trim() || "Untitled skill",
          type: skillType,
          source,
          summary: draft.summary,
          items: draft.items,
          steps: draft.steps.map((s, index) => ({ ...s, order: index })),
        }),
      });
      setSaved(skill);
      setDraft(null);
      setText("");
      setInterim("");
      setQuickText("");
      pickFile(null);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function patchItem(index: number, name: string) {
    setDraft((d) =>
      d ? { ...d, items: d.items.map((item, i) => (i === index ? { ...item, name } : item)) } : d
    );
  }

  function patchStep(index: number, instruction: string) {
    setDraft((d) =>
      d
        ? { ...d, steps: d.steps.map((step, i) => (i === index ? { ...step, instruction } : step)) }
        : d
    );
  }

  function removeItem(index: number) {
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== index) } : d));
  }

  function removeStep(index: number) {
    setDraft((d) => (d ? { ...d, steps: d.steps.filter((_, i) => i !== index) } : d));
  }

  function addItem() {
    setDraft((d) =>
      d ? { ...d, items: [...d.items, { name: "", required: true, aliases: [] }] } : d
    );
  }

  function addStep() {
    const step: SkillStep = {
      order: draft?.steps.length ?? 0,
      instruction: "",
      target_element_id: null,
      screen: null,
      expected_event: null,
    };
    setDraft((d) => (d ? { ...d, steps: [...d.steps, step] } : d));
  }

  const sourceLabel = mode === "voice" ? "voice" : mode === "photo" ? "photo" : "text";

  return (
    <div className="mx-auto max-w-5xl overflow-x-clip px-4 pb-10 sm:px-6">
      {/* Hero */}
      <section className="relative mx-auto max-w-2xl pt-6 text-center sm:pt-10">
        <div className="pointer-events-none absolute -left-16 top-8 size-44 rounded-full bg-warm/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-16 size-48 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative mx-auto inline-block max-w-[360px] sm:max-w-[430px]">
          <div className="app-card relative rounded-[30px] px-6 py-5">
            <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[31px]">
              I&apos;m here.
              <br />
              <span className="text-accent">What do you need?</span>
            </h1>
            <span className="absolute -bottom-[7px] left-1/2 size-4 -translate-x-1/2 rotate-45 border-b border-r border-border bg-surface" />
          </div>
        </div>

        <Orb />

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={startTalk}
            className="app-card group flex flex-col items-center px-2 py-4 text-center transition hover:-translate-y-1 hover:border-accent/40 sm:px-4 sm:py-5"
          >
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white sm:size-12">
              <MicIcon className="size-5" />
            </span>
            <span className="mt-3 text-[13px] font-extrabold sm:text-sm">Talk to me</span>
            <span className="mt-0.5 text-[11px] font-semibold leading-tight text-muted sm:text-xs">
              Ask or teach
            </span>
          </button>

          <button
            type="button"
            onClick={startPhoto}
            className="app-card group flex flex-col items-center px-2 py-4 text-center transition hover:-translate-y-1 hover:border-accent/40 sm:px-4 sm:py-5"
          >
            <span className="grid size-11 place-items-center rounded-full bg-warm-soft text-[#b96d1d] transition group-hover:bg-warm group-hover:text-white sm:size-12">
              <CameraIcon className="size-5" />
            </span>
            <span className="mt-3 text-[13px] font-extrabold sm:text-sm">Show me</span>
            <span className="mt-0.5 text-[11px] font-semibold leading-tight text-muted sm:text-xs">
              Photo or camera
            </span>
          </button>

          <Link
            href="/demo/photoshare?mode=teach"
            className="app-card group flex flex-col items-center px-2 py-4 text-center transition hover:-translate-y-1 hover:border-accent/40 sm:px-4 sm:py-5"
          >
            <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-foreground transition group-hover:bg-foreground group-hover:text-white sm:size-12">
              <MonitorIcon className="size-5" />
            </span>
            <span className="mt-3 text-[13px] font-extrabold sm:text-sm">On your screen</span>
            <span className="mt-0.5 text-[11px] font-semibold leading-tight text-muted sm:text-xs">
              Teach a website
            </span>
          </Link>
        </div>

        <Link
          href="/alexa"
          className="app-card group mx-auto mt-3 flex max-w-xl items-center gap-3 rounded-[22px] border-accent/25 bg-accent-soft/55 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_10px_24px_-12px_rgba(47,107,255,0.9)]">
            <MicIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-extrabold">Ask ONCE out loud</span>
              <span className="rounded-full bg-surface/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-accent">
                Alexa+ MCP
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold text-muted">
              Real MCP client + voice. See the actual tool call behind every answer.
            </span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-accent transition group-hover:translate-x-0.5" />
        </Link>

        <form
          onSubmit={submitQuick}
          className="app-card mx-auto mt-4 flex max-w-xl items-center gap-2 rounded-full py-1.5 pl-2 pr-1.5 sm:mt-5"
        >
          <button
            type="button"
            onClick={startTalk}
            aria-label="Start voice input"
            className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
              listening ? "bg-danger text-white" : "bg-accent-soft text-accent hover:bg-accent hover:text-white"
            }`}
          >
            <MicIcon className="size-4" />
          </button>
          <input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="or type here…"
            aria-label="Teach or ask ONCE"
            className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-muted/70"
          />
          <button
            type="submit"
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-white transition hover:bg-accent"
          >
            <ArrowRightIcon className="size-4" />
          </button>
        </form>

        <p className="mt-3 text-[11px] font-bold text-muted">
          Voice-first · Photos · Real storage · Nothing invented
        </p>
      </section>

      {/* Composer */}
      <section
        id="teach"
        ref={composerRef}
        className="app-card mx-auto mt-10 max-w-3xl scroll-mt-24 p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Teach ONCE</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">
              Show me your method
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted">
              Speak, type or show a photo. I&apos;ll draft it — you confirm before saving.
            </p>
          </div>
          <label htmlFor="skill-type" className="sr-only">
            Kind of skill
          </label>
          <select
            id="skill-type"
            value={skillType}
            onChange={(e) => setSkillType(e.target.value as SkillType)}
            className="rounded-full border border-border bg-surface-2 px-3.5 py-2 text-xs font-extrabold text-foreground outline-none focus:border-accent"
          >
            {SKILL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex rounded-full bg-surface-2 p-1">
          {(["text", "voice", "photo"] as Mode[]).map((m) => {
            const Icon = m === "text" ? PencilIcon : m === "voice" ? MicIcon : CameraIcon;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  if (m === "photo") window.setTimeout(() => photoInputRef.current?.click(), 100);
                }}
                aria-pressed={mode === m}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-extrabold transition sm:text-sm ${
                  mode === m
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {m === "text" ? "Type" : m === "voice" ? "Speak" : "Photo"}
              </button>
            );
          })}
        </div>

        {mode === "voice" && (
          <div className="mt-4 rounded-[24px] border border-border bg-surface-2/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3 py-1 text-xs font-extrabold text-danger">
                <span className="size-1.5 animate-pulse rounded-full bg-danger" />
                {listening ? "Recording…" : "Voice ready"}
              </span>
              <span className="font-mono text-xs font-bold text-muted">
                {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={listening}
                className={`grid size-14 shrink-0 place-items-center rounded-full text-white shadow-lg transition ${
                  listening
                    ? "bg-danger hover:opacity-90"
                    : "bg-accent hover:bg-accent-deep"
                }`}
              >
                <MicIcon className="size-6" />
                <span className="sr-only">{listening ? "Stop listening" : "Start listening"}</span>
              </button>
              <div className="min-w-0 flex-1">
                <Waveform />
                <p className="mt-1 truncate text-xs font-semibold text-muted">
                  {listening
                    ? interim || "I'm listening — speak naturally."
                    : "Tap the mic and tell me how you do it."}
                </p>
              </div>
            </div>

            {voiceError && (
              <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-bold text-danger">
                {voiceError}
              </p>
            )}
          </div>
        )}

        {mode === "photo" && (
          <div className="mt-4 rounded-[24px] border border-border bg-surface-2/70 p-4">
            <input
              id="photo"
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {preview ? (
              <div className="relative overflow-hidden rounded-[20px] border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset */}
                <img
                  src={preview}
                  alt="Selected photo preview"
                  className="max-h-64 w-full object-cover"
                />
                <div className="absolute left-3 top-3 rounded-full bg-foreground/80 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white backdrop-blur">
                  Your photo
                </div>
              </div>
            ) : (
              <label
                htmlFor="photo"
                className="flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-border bg-surface/60 px-4 py-8 text-center transition hover:border-accent/60"
              >
                <span className="grid size-12 place-items-center rounded-full bg-warm-soft text-[#b96d1d]">
                  <ImageIcon className="size-6" />
                </span>
                <span className="mt-3 text-sm font-extrabold">Show me a photo</span>
                <span className="mt-1 text-xs font-semibold text-muted">
                  Lay the items out, or capture the screen. JPEG, PNG or WebP.
                </span>
              </label>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                htmlFor="photo"
                className="cursor-pointer rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-extrabold transition hover:border-accent"
              >
                {preview ? "Change photo" : "Choose photo"}
              </label>
              {preview && (
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  className="rounded-full px-3 py-2 text-xs font-bold text-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
            </div>
            <label htmlFor="photo-note" className="mt-3 block text-xs font-extrabold text-muted">
              Optional note
            </label>
            <input
              id="photo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. this is everything for the conference"
              className="mt-1 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </div>
        )}

        <label htmlFor="transcript" className="mt-4 block text-xs font-extrabold text-muted">
          {mode === "voice" ? "Transcript" : mode === "photo" ? "Anything else I should know?" : "What should ONCE remember?"}
        </label>
        <textarea
          id="transcript"
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={mode === "voice" ? 3 : 4}
          placeholder={PROMPTS[0]}
          className="mt-1 w-full resize-none rounded-[20px] border border-border bg-surface px-4 py-3 text-sm font-semibold leading-relaxed outline-none placeholder:text-muted/55 focus:border-accent"
        />
        {interim && <p className="mt-1 text-xs font-semibold text-muted">{interim}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROMPTS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setText(p);
                setMode("text");
              }}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-[10px] font-bold text-muted transition hover:bg-accent-soft hover:text-accent"
            >
              {i === 0 ? "Conference bag" : i === 1 ? "Tea ritual" : "PhotoShare flow"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void extract()}
          disabled={busy !== null}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(47,107,255,0.8)] transition hover:bg-accent-deep disabled:opacity-50"
        >
          {busy === "extract" ? (
            "Thinking…"
          ) : (
            <>
              <SparkleIcon className="size-4" />
              Create draft with AI
            </>
          )}
        </button>
        <p className="mt-2 text-center text-[10px] font-bold text-muted">
          The AI only drafts. Nothing is stored until you confirm.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[18px] border border-red-200 bg-danger-soft px-4 py-3 text-sm font-bold text-red-700"
          >
            {error}
          </p>
        )}
      </section>

      {/* Draft review */}
      {draft && (
        <section
          ref={draftRef}
          className="app-card mx-auto mt-6 max-w-3xl scroll-mt-24 overflow-hidden"
        >
          <div className="border-b border-border/70 bg-gradient-to-b from-accent-soft/80 to-transparent px-5 pb-4 pt-5 text-center sm:px-6">
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-surface text-accent shadow-sm">
              <SparkleIcon className="size-5" />
            </span>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">
              I&apos;ve learned your method!
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-muted">
              Here&apos;s what I understood. You can edit anything before saving.
            </p>
            <span className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-surface px-3 py-1 text-[10px] font-extrabold text-muted">
              <SparkleIcon className="size-3 text-accent" />
              {engineLabel(draft.engine)}
            </span>
          </div>

          <div className="p-4 sm:p-6">
            {draft.ambiguities.length > 0 && (
              <ul className="mb-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
                {draft.ambiguities.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="draft-title" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  Skill title
                </label>
                <input
                  id="draft-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="mt-1 w-full bg-transparent text-xl font-extrabold tracking-[-0.02em] outline-none sm:text-2xl"
                />
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[10px] font-extrabold text-muted">
                <PencilIcon className="size-3" />
                Editable
              </span>
            </div>

            <div className="mt-5 rounded-[22px] border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <h3 className="text-sm font-extrabold">
                  Items <span className="text-muted">({draft.items.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-extrabold text-accent"
                >
                  <PlusIcon className="size-3.5" />
                  Add item
                </button>
              </div>
              {draft.items.length === 0 ? (
                <p className="px-4 py-4 text-sm font-semibold text-muted">
                  No items proposed — add any you need.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 px-2">
                  {draft.items.map((item, index) => (
                    <li key={`${index}-${item.name}`} className="flex items-center gap-2.5 px-2 py-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-white">
                        <CheckIcon className="size-3.5" />
                      </span>
                      <input
                        value={item.name}
                        onChange={(e) => patchItem(index, e.target.value)}
                        aria-label={`Item ${index + 1}`}
                        className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 text-sm font-bold outline-none focus:bg-surface-2"
                      />
                      {index < 4 && (
                        <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-muted sm:inline">
                          packed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
                        aria-label={`Remove ${item.name || "item"}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 rounded-[22px] border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <h3 className="text-sm font-extrabold">
                  Steps <span className="text-muted">({draft.steps.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-extrabold text-accent"
                >
                  <PlusIcon className="size-3.5" />
                  Add step
                </button>
              </div>
              {draft.steps.length === 0 ? (
                <p className="px-4 py-4 text-sm font-semibold text-muted">
                  No steps proposed — add them if this is a procedure.
                </p>
              ) : (
                <ol className="divide-y divide-border/60 px-2">
                  {draft.steps.map((step, index) => (
                    <li key={`${index}-${step.instruction}`} className="flex items-center gap-2.5 px-2 py-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-extrabold text-white">
                        {index + 1}
                      </span>
                      <input
                        value={step.instruction}
                        onChange={(e) => patchStep(index, e.target.value)}
                        aria-label={`Step ${index + 1}`}
                        className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 text-sm font-semibold outline-none focus:bg-surface-2"
                      />
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
                        aria-label={`Remove step ${index + 1}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-end">
              <div className="w-full sm:max-w-[220px]">
                <label htmlFor="owner" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                  Save as
                </label>
                <input
                  id="owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="mt-1 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-bold outline-none focus:border-accent"
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-extrabold text-white transition hover:bg-accent-deep disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save as Skill"}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] font-bold text-muted sm:text-right">
              Saved to {sourceLabel} · you can edit or share it later
            </p>
          </div>
        </section>
      )}

      {saved && (
        <section className="mx-auto mt-6 max-w-3xl rounded-[28px] border border-success/25 bg-success-soft p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success text-white">
              <CheckIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-extrabold text-[#1f6a44]">
                Saved “{saved.title}”
              </p>
              <p className="mt-1 text-sm font-semibold text-[#397a58]">
                {saved.items.length} items · {saved.steps.length} steps · version {saved.version}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/skills/${saved.skill_id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#1f6a44] shadow-sm"
                >
                  <BagIcon className="size-3.5" />
                  Open skill
                </Link>
                <Link
                  href="/recall"
                  className="inline-flex items-center gap-1.5 rounded-full bg-success px-4 py-2 text-xs font-extrabold text-white"
                >
                  <SparkleIcon className="size-3.5" />
                  What am I missing?
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2 text-[10px] font-bold text-muted">
        <span className="rounded-full border border-border/80 bg-surface/70 px-3 py-1.5">Grounded memory</span>
        <span className="rounded-full border border-border/80 bg-surface/70 px-3 py-1.5">No invented items</span>
        <span className="rounded-full border border-border/80 bg-surface/70 px-3 py-1.5">MCP 2025-11-25</span>
        <span className="rounded-full border border-border/80 bg-surface/70 px-3 py-1.5">Store: AWS live · memory mock</span>
      </div>
    </div>
  );
}
