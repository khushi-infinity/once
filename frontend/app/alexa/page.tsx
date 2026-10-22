"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Orb } from "@/components/brand";
import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  HelpIcon,
  ListIcon,
  MicIcon,
  MonitorIcon,
  SparkleIcon,
  VolumeIcon,
} from "@/components/icons";
import { McpError, OnceMcpClient, type McpCall, type McpTool } from "@/lib/mcp";
import type { Draft } from "@/lib/types";

type Role = "user" | "once";

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  tool?: McpCall;
  error?: boolean;
  links?: { href: string; label: string; primary?: boolean }[];
};

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

type RecallValue = {
  skill?: { skill_id?: string; title?: string; items?: { name: string }[] };
  not_confirmed?: { name: string }[];
  matched_terms?: string[];
  explanation?: string;
  error?: string;
};

type SkillShape = {
  skill_id: string;
  title: string;
  type: string;
  summary?: string | null;
  items?: { name: string }[];
  steps?: { instruction: string }[];
  owner_id?: string;
};

type StartValue = {
  session_id?: string;
  step_order?: number | null;
  instruction?: string | null;
  target_element_id?: string | null;
  done?: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "What am I missing for the conference?",
  "List my skills",
  "Start the PhotoShare workflow",
  "What is in my event bag?",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function firstMatch(skills: SkillShape[], query: string): SkillShape | null {
  const q = query.toLowerCase();
  const words = q.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  let best: { score: number; skill: SkillShape } | null = null;
  for (const skill of skills) {
    const haystack = `${skill.title} ${skill.summary ?? ""} ${skill.type.replaceAll("_", " ")}`.toLowerCase();
    let score = 0;
    for (const word of words) if (haystack.includes(word)) score += 1;
    if (score > 0 && (best === null || score > best.score)) best = { score, skill };
  }
  return best?.skill ?? null;
}

function parseHave(text: string): string[] {
  const match = text.match(/\b(?:i have|i've packed|i already have|already packed|packed|have)\b(.+)/i);
  if (!match) return [];
  return match[1]
    .replace(/\b(?:but|except|what|do|i|need|missing|for|the|my|in|bag|already|have)\b/gi, " ")
    .split(/,| and | & /i)
    .map((part) => part.trim().replace(/[.?!]+$/, ""))
    .filter((part) => part.length > 1)
    .slice(0, 20);
}

export default function AlexaPage() {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [reader, setReader] = useState("demo-teacher");
  const [traffic, setTraffic] = useState<McpCall[]>([]);
  const [showTraffic, setShowTraffic] = useState(false);

  const clientRef = useRef<OnceMcpClient | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const addMessage = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...message, id: newId() }]);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = text.replace(/[“”"`*#]/g, "").replace(/\s+/g, " ").trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "en-US";
      utterance.rate = 1.02;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [voiceOn]
  );

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setMessages([]);
    setTraffic([]);
    const client = clientRef.current ?? new OnceMcpClient("/mcp");
    clientRef.current = client;
    try {
      await client.connect();
      setTools(client.tools);
      setProtocol(client.protocolVersion);
      setServerName(client.serverName);
      setStatus("connected");
      addMessage({
        role: "once",
        text:
          `Connected to ${client.serverName ?? "ONCE"} over MCP ${client.protocolVersion ?? ""}. ` +
          `I can only answer from skills stored for ${reader}. Ask me what you're missing, list your skills, or start a guided workflow.`,
      });
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error
          ? e.message
          : "Could not connect to the MCP server."
      );
    }
  }, [addMessage, reader]);

  useEffect(() => {
    // Defer one tick so the initial state update happens outside the effect
    // body (React's set-state-in-effect lint rule).
    const timer = window.setTimeout(() => void connect(), 0);
    return () => {
      window.clearTimeout(timer);
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      void clientRef.current?.close();
    };
    // Connect once on mount. A reader switch does not reconnect the transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function runTool(name: string, args: Record<string, unknown>): Promise<McpCall> {
    const client = clientRef.current;
    if (!client) throw new McpError("The MCP client is not connected.");
    const call = await client.callTool(name, args);
    setTraffic((prev) => [...prev, call]);
    return call;
  }

  async function route(text: string): Promise<Omit<ChatMessage, "id" | "role">> {
    const q = text.toLowerCase();

    // "What am I missing?" — grounded recall, never a generated list.
    const recallReply = async (): Promise<Omit<ChatMessage, "id" | "role">> => {
      const call = await runTool("once_recall_missing", {
        reader_id: reader,
        query: text,
        have: parseHave(text),
      });
      const value = call.value as RecallValue;
      if (value?.error) {
        return {
          text: value.error,
          tool: call,
          error: true,
          links: [{ href: "/", label: "Teach ONCE a skill", primary: true }],
        };
      }
      const names = (value.not_confirmed ?? []).map((item) => item.name);
      const title = value.skill?.title ?? "your saved skill";
      return {
        text:
          names.length > 0
            ? `For “${title}”, ${names.length} required ${names.length === 1 ? "item is" : "items are"} not confirmed: ${names.join(", ")}. Not confirmed is not proof of absence — check before you leave.`
            : `Every required item in “${title}” is confirmed by what you told me.`,
        tool: call,
        links: value.skill?.skill_id
          ? [{ href: `/skills/${value.skill.skill_id}`, label: "Open the stored skill", primary: true }]
          : undefined,
      };
    };

    if (/\b(missing|what do i need|pack for|packed for)\b/.test(q)) {
      return recallReply();
    }

    // "Start the PhotoShare workflow" — a real learner session, created by MCP.
    if (/\b(start|guide|teach me|walk me through|photoshare)\b/.test(q)) {
      const listed = await runTool("once_list_skills", { reader_id: reader });
      const skills = (Array.isArray(listed.value) ? listed.value : []) as SkillShape[];
      const workflow =
        firstMatch(skills, "photoshare browser workflow") ??
        skills.find((skill) => skill.type === "browser_workflow") ??
        null;
      if (!workflow) {
        return {
          text: `No browser workflow is stored for ${reader}. Teach one in the PhotoShare demo first.`,
          tool: listed,
          error: true,
          links: [{ href: "/demo/photoshare?mode=teach", label: "Teach a workflow", primary: true }],
        };
      }
      const started = await runTool("once_start_session", {
        skill_id: workflow.skill_id,
        learner_id: "demo-learner",
        // A voice "start" is an explicit new run; a direct learner link still
        // resumes. This also makes repeat demos deterministic.
        restart: true,
      });
      const value = started.value as StartValue;
      if (value?.error) return { text: value.error, tool: started, error: true };
      const href = `/demo/photoshare?session_id=${encodeURIComponent(
        value.session_id ?? ""
      )}&learner_id=demo-learner&skill_id=${encodeURIComponent(workflow.skill_id)}`;
      return {
        text: `Session started for “${workflow.title}”. Next step: ${
          value.instruction ?? "open the first control"
        }. The learner view will outline the real DOM control and verify each click.`,
        tool: started,
        links: [{ href, label: "Open the guided learner", primary: true }],
      };
    }

    // "What is in my event bag?" / "show my tea skill" — retrieve, don't invent.
    if (/\b(show|open|what is in|what's in|do i know|do you remember)\b/.test(q)) {
      const listed = await runTool("once_list_skills", { reader_id: reader });
      const skills = (Array.isArray(listed.value) ? listed.value : []) as SkillShape[];
      const match = firstMatch(skills, text);
      if (!match) {
        return {
          text: `I could not find a stored skill matching that. You have ${skills.length} skill${
            skills.length === 1 ? "" : "s"
          } for ${reader}: ${skills.map((skill) => skill.title).join(", ") || "none"}.`,
          tool: listed,
          error: true,
        };
      }
      const got = await runTool("once_get_skill", { skill_id: match.skill_id, reader_id: reader });
      const getError = (got.value as { error?: string })?.error;
      if (getError) {
        return { text: getError, tool: got, error: true };
      }
      const skill = got.value as SkillShape;
      const itemNames = (skill.items ?? []).map((item) => item.name);
      const stepNames = (skill.steps ?? []).map((step) => step.instruction);
      return {
        text:
          `“${skill.title}” is stored for ${skill.owner_id ?? reader}. ` +
          (itemNames.length
            ? `It has ${itemNames.length} items: ${itemNames.join(", ")}.`
            : `It has ${stepNames.length} steps: ${stepNames.slice(0, 5).join(" → ")}.`),
        tool: got,
        links: [{ href: `/skills/${skill.skill_id}`, label: "Open the skill", primary: true }],
      };
    }

    // "Packing for a conference" without the word "missing" still means recall.
    if (/\b(conference|event bag|trip bag)\b/.test(q)) {
      return recallReply();
    }

    // "Remember that I pack..." — a draft only. The teacher must confirm it.
    if (/\b(teach|remember|save this|learn this)\b/.test(q)) {
      const call = await runTool("once_extract_draft", { transcript: text, skill_type: "packing" });
      const value = call.value as {
        draft?: Draft;
        engine?: { provider?: string; model?: string };
        error?: string;
      };
      if (value?.error) return { text: value.error, tool: call, error: true };
      const title = value.draft?.title ?? "a new skill";
      const count = value.draft?.items?.length ?? 0;
      if (value.draft) {
        // Hand the exact draft to the Teach screen so "review and save" is a
        // real continuation, not a link to an empty form.
        try {
          sessionStorage.setItem(
            "once:pending-draft",
            JSON.stringify({ transcript: text, draft: value.draft })
          );
        } catch {
          // Private-mode storage can fail; the link still opens Teach.
        }
      }
      return {
        text: `I drafted “${title}” with ${count} item${count === 1 ? "" : "s"} using ${
          value.engine?.provider ?? "the configured provider"
        }. Nothing is saved yet — review and confirm it on the Teach screen.`,
        tool: call,
        links: [{ href: "/", label: "Review and save the draft", primary: true }],
      };
    }

    // List skills.
    if (/\b(list|skills|what do i know)\b/.test(q)) {
      const listed = await runTool("once_list_skills", { reader_id: reader });
      const skills = (Array.isArray(listed.value) ? listed.value : []) as SkillShape[];
      return {
        text:
          skills.length === 0
            ? `No skills are stored for ${reader} yet. Teach one by voice, text or photo.`
            : `${reader} has ${skills.length} skill${skills.length === 1 ? "" : "s"}: ${skills
                .map((skill) => skill.title)
                .join("; ")}.`,
        tool: listed,
        links: skills.slice(0, 3).map((skill) => ({
          href: `/skills/${skill.skill_id}`,
          label: skill.title,
        })),
      };
    }

    // Honest fallback: retrieve the real library, do not invent an answer.
    const listed = await runTool("once_list_skills", { reader_id: reader });
    const skills = (Array.isArray(listed.value) ? listed.value : []) as SkillShape[];
    return {
      text: `I can only answer from stored skills, and that question does not match one. For ${reader} I can see ${
        skills.length
      } skill${skills.length === 1 ? "" : "s"}: ${
        skills.map((skill) => skill.title).join(", ") || "none"
      }. Try “what am I missing for the conference?” or “list my skills”.`,
      tool: listed,
      error: true,
    };
  }

  async function ask(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy || status !== "connected") return;
    setInput("");
    setError(null);
    addMessage({ role: "user", text });
    setBusy(true);
    try {
      const reply = await route(text);
      addMessage({ role: "once", ...reply });
      speak(reply.text);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The MCP call failed.";
      setError(message);
      addMessage({ role: "once", text: message, error: true });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function dictate() {
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
      setError(
        "This browser has no speech recognition. Chrome, Edge and Safari support it over https or localhost; type instead."
      );
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (interimText) setInput(interimText);
      if (finalText.trim()) {
        setInput("");
        void ask(finalText.trim());
      }
    };
    rec.onerror = (event) => {
      setError(`Microphone error: ${event.error}. You can type instead.`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    window.speechSynthesis?.cancel();
    rec.start();
    setListening(true);
    setError(null);
  }

  const connected = status === "connected";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
      <section className="relative overflow-hidden pt-6 sm:pt-9">
        <div className="pointer-events-none absolute -left-20 top-0 size-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-16 size-52 rounded-full bg-warm/20 blur-3xl" />
        <div className="relative grid items-center gap-3 sm:grid-cols-[1fr_170px]">
          <div>
            <p className="eyebrow">Alexa+ simulated experience</p>
            <h1 className="mt-1 text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[42px]">
              Ask ONCE
              <br />
              <span className="text-accent">out loud.</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-muted">
              This page is a real MCP client. It performs the handshake, lists tools, and calls the
              same self-hosted ONCE MCP server a voice assistant would use. The transcript below is
              the actual JSON-RPC traffic — no scripted replies.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide ${
                  connected
                    ? "bg-success-soft text-[#246b48]"
                    : status === "error"
                      ? "bg-danger-soft text-danger"
                      : "bg-warm-soft text-[#a96822]"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    connected ? "bg-success" : status === "error" ? "bg-danger" : "animate-pulse bg-warm"
                  }`}
                />
                {connected ? "MCP connected" : status === "error" ? "MCP unavailable" : "Connecting…"}
              </span>
              {protocol && (
                <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted">
                  protocol {protocol}
                </span>
              )}
              {connected && (
                <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted">
                  {tools.length} tools
                </span>
              )}
              <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted">
                {serverName ?? "ONCE"} MCP
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            <Orb small />
          </div>
        </div>
      </section>

      <section className="app-card mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface-2/55 px-4 py-3 sm:px-5">
          <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
            <SparkleIcon className="size-3.5 text-accent" />
            Speaking as
          </span>
          <select
            value={reader}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value;
              setReader(next);
              setTraffic([]);
              setError(null);
              setMessages([
                {
                  id: newId(),
                  role: "once",
                  text: `Now speaking as ${next}. I can only answer from skills stored for this identity. Ask me what you're missing, list your skills, or start a guided workflow.`,
                },
              ]);
            }}
            aria-label="Demo identity for MCP calls"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-extrabold outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="demo-teacher">demo-teacher</option>
            <option value="demo-learner">demo-learner</option>
          </select>
          <span className="hidden text-[10px] font-bold text-muted sm:inline">
            demo identity · production uses a real account
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVoiceOn((on) => !on)}
              aria-pressed={voiceOn}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-extrabold transition ${
                voiceOn
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : "border-border bg-surface text-muted"
              }`}
            >
              <VolumeIcon className="size-3.5" />
              {voiceOn ? "Voice replies on" : "Voice replies off"}
            </button>
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted transition hover:border-accent hover:text-accent"
            >
              Reconnect
            </button>
          </div>
        </div>

        {status === "error" && (
          <div className="m-4 rounded-[18px] border border-red-200 bg-danger-soft px-4 py-3 text-sm font-bold text-red-700 sm:m-5">
            <p>{error ?? "The MCP server is not reachable."}</p>
            <p className="mt-2 text-xs font-semibold">
              Start the API with{" "}
              <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px]">
                cd backend &amp;&amp; uv run uvicorn app.main:app --port 8000
              </code>
              ; it mounts MCP at <code>/mcp</code>. Then press Reconnect. If you use the
              standalone server instead, set <code>MCP_URL</code> to its port.
            </p>
          </div>
        )}

        {status === "connecting" && (
          <div className="p-5">
            <div className="h-20 animate-pulse rounded-[20px] bg-surface-2" />
            <p className="mt-3 text-center text-xs font-bold text-muted">
              Performing initialize → notifications/initialized → tools/list…
            </p>
          </div>
        )}

        {connected && (
          <>
            <div
              aria-live="polite"
              className="max-h-[520px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[92%] rounded-[22px] px-4 py-3 text-sm font-semibold leading-relaxed sm:max-w-[82%] ${
                      message.role === "user"
                        ? "rounded-br-md bg-accent text-white"
                        : message.error
                          ? "rounded-bl-md border border-amber-200 bg-amber-50 text-amber-950"
                          : "rounded-bl-md border border-border bg-surface text-foreground"
                    }`}
                  >
                    {message.role === "once" && (
                      <p className="mb-1 flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] opacity-70">
                        {message.error ? (
                          <HelpIcon className="size-3" />
                        ) : (
                          <SparkleIcon className="size-3" />
                        )}
                        ONCE
                        {message.tool && (
                          <span className="rounded-full bg-black/5 px-2 py-0.5 font-mono text-[9px] font-bold normal-case tracking-normal">
                            {message.tool.tool} · {message.tool.durationMs}ms
                          </span>
                        )}
                      </p>
                    )}
                    <p>{message.text}</p>
                    {message.links && message.links.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {message.links.map((link) => (
                          <Link
                            key={`${message.id}-${link.href}`}
                            href={link.href}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${
                              link.primary
                                ? "bg-accent text-white"
                                : "border border-border bg-surface text-foreground"
                            }`}
                          >
                            {link.label}
                            <ArrowRightIcon className="size-3" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-[22px] rounded-bl-md border border-border bg-surface px-4 py-3 text-xs font-bold text-muted">
                    <span className="flex gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-accent" />
                    </span>
                    Calling MCP…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-5">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted">
                Try
              </span>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void ask(suggestion)}
                  disabled={busy}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-extrabold text-muted transition hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
              className="border-t border-border/60 bg-surface-2/45 p-3 sm:p-4"
            >
              <div className="flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-2 pr-1.5">
                <button
                  type="button"
                  onClick={dictate}
                  aria-pressed={listening}
                  aria-label={listening ? "Stop listening" : "Ask by voice"}
                  className={`grid size-10 shrink-0 place-items-center rounded-full transition ${
                    listening
                      ? "bg-danger text-white"
                      : "bg-accent-soft text-accent hover:bg-accent hover:text-white"
                  }`}
                >
                  <MicIcon className="size-4" />
                </button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='Say or type: "What am I missing for the conference?"'
                  aria-label="Ask ONCE through MCP"
                  className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-muted/65"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send MCP request"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-white transition hover:bg-accent disabled:opacity-40"
                >
                  <ArrowRightIcon className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] font-bold text-muted">
                {listening
                  ? "Listening — speak naturally, then I'll send the real MCP call."
                  : "Every answer is grounded in stored skills. If nothing matches, ONCE says so."}
              </p>
            </form>
          </>
        )}
      </section>

      {error && status !== "error" && (
        <p
          role="alert"
          className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowTraffic((show) => !show)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-[11px] font-extrabold text-muted transition hover:border-accent hover:text-accent"
        >
          <ListIcon className="size-3.5" />
          {showTraffic ? "Hide MCP traffic" : `Show MCP traffic (${traffic.length})`}
        </button>
        <p className="text-[10px] font-bold text-muted">
          Streamable HTTP · initialize + tools/list + tools/call
        </p>
      </div>

      {showTraffic && (
        <section className="app-card mt-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-extrabold">Actual tool calls</h2>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-extrabold text-muted">
              {traffic.length} call{traffic.length === 1 ? "" : "s"}
            </span>
          </div>
          {traffic.length === 0 ? (
            <p className="px-4 py-5 text-sm font-semibold text-muted sm:px-5">
              Ask a question to see the real MCP request and result.
            </p>
          ) : (
            <ol className="divide-y divide-border/55">
              {traffic.map((call, index) => (
                <li key={`${call.tool}-${index}-${call.durationMs}`} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-extrabold text-white">
                      {index + 1}
                    </span>
                    <code className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-extrabold text-accent">
                      tools/call {call.tool}
                    </code>
                    <span className="text-[10px] font-bold text-muted">{call.durationMs}ms</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted">
                        arguments
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-[14px] bg-surface-2 p-2.5 text-[10px] font-semibold leading-relaxed text-foreground/80">
                        {JSON.stringify(call.args, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted">
                        result
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-[14px] bg-[#0b1740] p-2.5 text-[10px] font-semibold leading-relaxed text-blue-50">
                        {JSON.stringify(call.value, null, 2)}
                      </pre>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: MicIcon,
            title: "Voice in",
            body: "Browser speech recognition turns a spoken question into the same MCP request.",
          },
          {
            icon: MonitorIcon,
            title: "Tool, not guess",
            body: "The client calls once_recall_missing or once_start_session; results come from the same server store (DynamoDB in live mode).",
          },
          {
            icon: CheckIcon,
            title: "Honest answer",
            body: "Unconfirmed items stay unconfirmed. A missing match returns an error, never an invented list.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="app-card-soft p-4">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
              <Icon className="size-4" />
            </span>
            <h3 className="mt-2 text-sm font-extrabold">{title}</h3>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      <p className="mx-auto mt-5 max-w-2xl text-center text-[10px] font-bold leading-relaxed text-muted">
        Alexa+ Add-on developer tools are select-partner only. This is the hackathon&apos;s
        simulated-experience path: a real web MCP client, the same self-hosted server, and a real
        JSON-RPC transcript. No Alexa+ SDK access is claimed.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/recall"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-extrabold transition hover:border-accent"
        >
          <BagIcon className="size-3.5 text-accent" />
          Open the checklist view
        </Link>
        <Link
          href="/demo/photoshare?mode=teach"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-extrabold transition hover:border-accent"
        >
          <MonitorIcon className="size-3.5 text-accent" />
          Teach a browser workflow
        </Link>
      </div>
    </div>
  );
}
