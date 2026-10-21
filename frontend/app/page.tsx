"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

export default function TeachPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [skillType, setSkillType] = useState<SkillType>("packing");
  const [owner, setOwner] = useState("demo-teacher");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
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

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

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
    setMode("voice");
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

  async function extract() {
    setError(null);
    setSaved(null);
    const source: SkillSource = mode === "voice" ? "voice" : mode === "photo" ? "photo" : "text";
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
        if (text.trim().length < 3) throw new Error("Tell ONCE a little more first.");
        next = await api<Draft>("/api/teach/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript: text.trim(), skill_type: skillType, source }),
        });
      }
      setDraft(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
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
      d
        ? { ...d, items: [...d.items, { name: "", required: true, aliases: [] }] }
        : d
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

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <section className="pt-8 pb-6">
        <h1 className="text-3xl font-semibold leading-tight">Teach ONCE, once.</h1>
        <p className="mt-2 text-muted">
          Speak, type or show a photo. ONCE proposes a structured draft, you confirm it, and it is
          stored as your own skill memory.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {(["text", "voice", "photo"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === m ? "bg-accent text-white" : "border border-border hover:border-accent"
              }`}
            >
              {m === "text" ? "⌨ Type" : m === "voice" ? "🎙 Speak" : "📷 Photo"}
            </button>
          ))}
          <label htmlFor="skill-type" className="ml-auto text-sm text-muted">
            Kind
          </label>
          <select
            id="skill-type"
            value={skillType}
            onChange={(e) => setSkillType(e.target.value as SkillType)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            {SKILL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {mode === "voice" && (
          <div className="mt-5 rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={listening}
                className={`flex size-14 items-center justify-center rounded-full text-white transition ${
                  listening ? "bg-red-600" : "bg-accent hover:opacity-90"
                }`}
              >
                <span aria-hidden>{listening ? "■" : "🎙"}</span>
                <span className="sr-only">{listening ? "Stop listening" : "Start listening"}</span>
              </button>
              <div className="text-sm">
                <p className="font-medium">
                  {listening ? "Listening — speak naturally" : "Tap to talk"}
                </p>
                <p className="text-muted">
                  {listening
                    ? interim || "Words appear below as you speak."
                    : "Your browser transcribes locally; only the text is sent to ONCE."}
                </p>
              </div>
            </div>
            {voiceError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {voiceError}
              </p>
            )}
          </div>
        )}

        {mode === "photo" && (
          <div className="mt-5 rounded-2xl border border-border bg-background p-4">
            <label htmlFor="photo" className="block text-sm font-medium">
              Show ONCE what you mean
            </label>
            <p className="mt-1 text-sm text-muted">
              A photo of the items laid out, or of the screen. ONCE lists what it sees; you correct
              the draft before saving.
            </p>
            <input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm"
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
              <img
                src={preview}
                alt="Selected photo preview"
                className="mt-3 max-h-56 rounded-xl border border-border object-contain"
              />
            )}
            <label htmlFor="photo-note" className="mt-3 block text-sm font-medium">
              Optional note for the photo
            </label>
            <input
              id="photo-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. this is everything for the conference"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        )}

        <label htmlFor="transcript" className="mt-5 block text-sm font-medium">
          {mode === "photo" ? "Or describe it in words (used with the photo)" : "What should ONCE remember?"}
        </label>
        <textarea
          id="transcript"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. I pack for events with my laptop, charger, HDMI adapter, badge and water bottle. Charge everything the night before and put the badge in the front pocket."
          className="mt-1 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted/60"
        />
        {interim && <p className="mt-1 text-sm text-muted">{interim}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={extract}
            disabled={busy !== null}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "extract" ? "Extracting…" : "Create draft with AI"}
          </button>
          <p className="text-xs text-muted">
            The AI only drafts. Nothing is stored until you confirm below.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {draft && (
        <section className="mt-6 rounded-3xl border border-accent/40 bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Review the draft</h2>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent">
              extracted by {engineLabel(draft.engine)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Correct anything that is wrong. Saving stores exactly what you approve.
          </p>

          {draft.ambiguities.length > 0 && (
            <ul className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {draft.ambiguities.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          )}

          <label htmlFor="draft-title" className="mt-4 block text-sm font-medium">
            Title
          </label>
          <input
            id="draft-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">Items ({draft.items.length})</h3>
            <button type="button" onClick={addItem} className="text-sm text-accent hover:underline">
              + Add item
            </button>
          </div>
          {draft.items.length === 0 && (
            <p className="mt-1 text-sm text-muted">No items proposed — add any you need.</p>
          )}
          <ul className="mt-2 space-y-2">
            {draft.items.map((item, index) => (
              <li key={`${index}-${item.name}`} className="flex items-center gap-2">
                <input
                  value={item.name}
                  onChange={(e) => patchItem(index, e.target.value)}
                  aria-label={`Item ${index + 1}`}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="rounded-lg px-2 py-2 text-sm text-muted hover:text-red-700"
                  aria-label={`Remove ${item.name || "item"}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-sm font-medium">Steps ({draft.steps.length})</h3>
            <button type="button" onClick={addStep} className="text-sm text-accent hover:underline">
              + Add step
            </button>
          </div>
          {draft.steps.length === 0 && (
            <p className="mt-1 text-sm text-muted">No steps proposed — add them if this is a procedure.</p>
          )}
          <ol className="mt-2 space-y-2">
            {draft.steps.map((step, index) => (
              <li key={`${index}-${step.instruction}`} className="flex items-start gap-2">
                <span className="mt-2 w-5 text-right text-xs text-muted">{index + 1}.</span>
                <input
                  value={step.instruction}
                  onChange={(e) => patchStep(index, e.target.value)}
                  aria-label={`Step ${index + 1}`}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  className="rounded-lg px-2 py-2 text-sm text-muted hover:text-red-700"
                  aria-label={`Remove step ${index + 1}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="owner" className="block text-sm font-medium">
                Save as
              </label>
              <input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Confirm & save to ONCE"}
            </button>
          </div>
        </section>
      )}

      {saved && (
        <section className="mt-6 rounded-3xl border border-green-200 bg-green-50 p-5 text-green-900">
          <p className="font-medium">Saved “{saved.title}” — version {saved.version}.</p>
          <p className="mt-1 text-sm">
            {saved.items.length} items, {saved.steps.length} steps, stored as {saved.type}.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link href={`/skills/${saved.skill_id}`} className="underline">
              Open the skill
            </Link>
            <Link href="/recall" className="underline">
              Try &ldquo;what am I missing?&rdquo;
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
