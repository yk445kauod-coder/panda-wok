"use client";

import { useState, useTransition } from "react";
import { BookOpen, Download, RefreshCw, Sparkles } from "lucide-react";
import {
  backfillMemoryAction,
  deleteMemoryAction,
  importGithubSkillsAction,
  rememberOwnerNoteAction,
  scheduleAgentCronAction,
  syncRepoSkillsAction,
} from "@/lib/actions/agent";
import { Button, Badge } from "@/components/ui/button";
import type { IndexedSkill } from "@/lib/services/agent";
import type { MemoryRow } from "@/lib/agent/memory";
import { formatDateTime, humanise } from "@/lib/utils/format";

/**
 * Skills and memory controls for the ops console.
 *
 * Three cheap capabilities, each with a visible result:
 *   - re-index the repo's own skills (skills.md, AGENTS.md)
 *   - import a skill from GitHub by pasting a URL
 *   - teach the agent an owner note that it will recall later
 *
 * Import is GitHub-only by design (SSRF guard in the server action), so the copy
 * says so rather than letting a failed paste look like a bug.
 */
export function AgentSkillsPanel({
  skills,
  memoryCount,
  baseUrl,
  memories = [],
}: {
  skills: IndexedSkill[];
  memoryCount: number;
  baseUrl: string;
  memories?: MemoryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [urls, setUrls] = useState("");
  const [note, setNote] = useState("");
  const [cronUrl, setCronUrl] = useState(baseUrl);

  const runBackfill = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await backfillMemoryAction();
      setMessage(
        result.ok
          ? `Embedded ${result.data.updated} memory row(s).`
          : result.error.message,
      );
    });
  };

  const runDeleteMemory = (id: string) => {
    setMessage(null);
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const result = await deleteMemoryAction(formData);
      setMessage(result.ok ? "Memory removed." : result.error.message);
    });
  };

  const runSync = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await syncRepoSkillsAction();
      if (result.ok) {
        const chunks = result.data.results.reduce((sum, r) => sum + r.chunks, 0);
        setMessage(`Indexed ${result.data.results.length} source(s), ${chunks} chunks.`);
      } else {
        setMessage(result.error.message);
      }
    });
  };

  const runImport = () => {
    setMessage(null);
    const formData = new FormData();
    formData.set("urls", urls);
    startTransition(async () => {
      const result = await importGithubSkillsAction(formData);
      if (result.ok) {
        const ok = result.data.results.filter((r) => r.ok).length;
        setMessage(`Imported ${ok} of ${result.data.results.length} URL(s).`);
        setUrls("");
      } else {
        setMessage(result.error.message);
      }
    });
  };

  const runRemember = () => {
    setMessage(null);
    const formData = new FormData();
    formData.set("content", note);
    startTransition(async () => {
      const result = await rememberOwnerNoteAction(formData);
      setMessage(result.ok ? "Saved to memory." : result.error.message);
      if (result.ok) setNote("");
    });
  };

  const runSchedule = () => {
    setMessage(null);
    const formData = new FormData();
    formData.set("baseUrl", cronUrl);
    startTransition(async () => {
      const result = await scheduleAgentCronAction(formData);
      setMessage(
        result.ok
          ? "Scheduler pointed at this URL. Each tick runs a report when one is due."
          : result.error.message,
      );
    });
  };

  return (
    <section className="washi-panel p-4" aria-label="Skills and memory">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
        <BookOpen className="size-4 text-jade-600" aria-hidden="true" />
        Skills &amp; memory
        <Badge tone="info">{memoryCount} memories</Badge>
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-700/75">
        Skills are split into small chunks, so the agent loads only the few lines a
        question needs. Import is restricted to GitHub URLs for safety.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={runSync} disabled={pending} className="gap-1.5">
          <RefreshCw className="size-4" aria-hidden="true" />
          Re-index repo skills
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor="skill-urls" className="text-sm font-medium text-ink-900">
          Import from GitHub (one URL per line)
        </label>
        <textarea
          id="skill-urls"
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
          rows={3}
          placeholder="https://github.com/owner/repo/blob/main/skills/foo/SKILL.md"
          className="w-full rounded-lg border border-ink-900/10 bg-rice-50 px-3 py-2 text-sm text-ink-900"
        />
        <Button type="button" onClick={runImport} disabled={pending || !urls.trim()} className="gap-1.5">
          <Download className="size-4" aria-hidden="true" />
          Import skills
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor="owner-note" className="text-sm font-medium text-ink-900">
          Teach the agent a lasting note
        </label>
        <textarea
          id="owner-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="e.g. Fridays are busiest — flag stock below two days' cover."
          className="w-full rounded-lg border border-ink-900/10 bg-rice-50 px-3 py-2 text-sm text-ink-900"
        />
        <Button type="button" onClick={runRemember} disabled={pending || !note.trim()} className="gap-1.5">
          <Sparkles className="size-4" aria-hidden="true" />
          Save to memory
        </Button>
      </div>

      {message ? <p className="mt-3 text-sm text-ink-800">{message}</p> : null}

      <div className="mt-4 space-y-2 border-t border-ink-900/10 pt-4">
        <label htmlFor="cron-url" className="text-sm font-medium text-ink-900">
          Schedule (base URL the agent calls)
        </label>
        <p className="text-xs text-ink-700/70">
          A database job ticks every 15 minutes and runs a report only when one is
          due, so changing the cadence above takes effect without a redeploy.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="cron-url"
            type="url"
            value={cronUrl}
            onChange={(event) => setCronUrl(event.target.value)}
            placeholder="https://panda-wok.pages.dev"
            className="min-w-64 flex-1 rounded-lg border border-ink-900/10 bg-rice-50 px-3 py-2 text-sm text-ink-900"
          />
          <Button type="button" onClick={runSchedule} disabled={pending || !cronUrl.trim()}>
            Schedule
          </Button>
        </div>
      </div>

      {skills.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {skills.map((skill) => (
            <li
              key={skill.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rice-100/70 px-3 py-2"
            >
              <span className="font-mono text-xs text-ink-900">{skill.name}</span>
              <span className="text-[11px] text-ink-700/70">
                {humanise(skill.source)} · {skill.chunks} chunks · {formatDateTime(skill.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-700/70">
          Nothing indexed yet. Re-index the repo skills to get started.
        </p>
      )}

      {/* Durable memory: what the agent will recall in later turns. */}
      <div className="mt-5 border-t border-ink-900/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-900">
            Remembered ({memoryCount})
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={runBackfill}
            disabled={pending}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Embed pending
          </Button>
        </div>
        {memories.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700/70">
            Nothing remembered yet. Save a lasting note above, or say
            &ldquo;remember …&rdquo; in the agent chat.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-rice-100/70 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-800">{memory.content}</p>
                  <p className="mt-0.5 text-[11px] text-ink-700/60">
                    {memory.scope} · {memory.kind} · {formatDateTime(memory.createdAt)}
                    {memory.hasEmbedding ? "" : " · not yet embedded"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-chili-600"
                  onClick={() => runDeleteMemory(memory.id)}
                  disabled={pending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
