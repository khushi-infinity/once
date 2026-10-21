"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { Skill } from "@/lib/types";

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
        if (!cancelled) setSkill(data);
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
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <p className="pt-8">
        <Link href="/skills" className="text-sm text-accent hover:underline">
          ← All skills
        </Link>
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grow">
          <label htmlFor="reader" className="block text-sm font-medium">
            Viewing as
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="reader"
              value={readerInput}
              onChange={(e) => setReaderInput(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setReader(readerInput.trim() || "demo-teacher")}
              className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent"
            >
              Switch
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      {skill && (
        <>
          <section className="mt-5 rounded-3xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl font-semibold">{skill.title}</h1>
              <span className="text-xs text-muted">v{skill.version}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {skill.type} · {skill.visibility} · owner {skill.owner_id} · source {skill.source}
            </p>
            {skill.summary && <p className="mt-3 text-sm">{skill.summary}</p>}
            <p className="mt-3 text-xs text-muted">id {skill.skill_id}</p>
          </section>

          {skill.type === "browser_workflow" && (
            <section className="mt-5 rounded-3xl border border-accent/40 bg-surface p-5">
              <h2 className="font-semibold">Guided browser session</h2>
              <p className="mt-1 text-sm text-muted">
                Share with a learner, then start a session. The learner gets the next step with a real
                highlight on the PhotoShare demo; a wrong click does not advance.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="learner" className="block text-sm font-medium">
                    Learner
                  </label>
                  <input
                    id="learner"
                    value={learner}
                    onChange={(e) => setLearner(e.target.value)}
                    className="mt-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => share(false)}
                  disabled={busy}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => share(true)}
                  disabled={busy}
                  className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:border-red-300 disabled:opacity-50"
                >
                  Revoke
                </button>
                <button
                  type="button"
                  onClick={startSession}
                  disabled={busy}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Start learner session →
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">
                Sharing is enforced server-side: the learner can read and run the skill but never edit
                or delete it.
              </p>
            </section>
          )}

          <section className="mt-5 rounded-3xl border border-border bg-surface p-5">
            <h2 className="font-semibold">Items ({skill.items.length})</h2>
            {skill.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No items recorded.</p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {skill.items.map((item) => (
                  <li key={item.name} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{item.name}</span>
                    {item.required && <span className="ml-2 text-xs text-muted">required</span>}
                    {item.aliases.length > 0 && (
                      <span className="mt-1 block text-xs text-muted">also: {item.aliases.join(", ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-5 rounded-3xl border border-border bg-surface p-5">
            <h2 className="font-semibold">Steps ({skill.steps.length})</h2>
            {skill.steps.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No steps recorded.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {skill.steps.map((step) => (
                  <li key={step.order} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="mr-2 text-muted">{step.order + 1}.</span>
                    {step.instruction}
                    {step.target_element_id && (
                      <span className="mt-1 block font-mono text-xs text-muted">
                        target: #{step.target_element_id} · event: {step.expected_event ?? "any"}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      {!skill && !error && <p className="mt-6 text-sm text-muted">Loading skill…</p>}
    </div>
  );
}

export default function SkillDetailRoute() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-6 pt-8 text-sm text-muted">Loading skill…</p>}>
      <SkillDetailPage />
    </Suspense>
  );
}
