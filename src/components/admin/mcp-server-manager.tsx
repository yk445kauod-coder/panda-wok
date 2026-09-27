"use client";

import { useState, useTransition } from "react";
import { Loader2, Plug, Plus, Trash2 } from "lucide-react";
import {
  deleteMcpServerAction,
  probeMcpServerAction,
  saveMcpServerAction,
} from "@/lib/actions/agent-ops";
import type { McpServerView } from "@/lib/services/agent-ops";
import { useT } from "@/components/i18n-provider";
import { Field as FormField } from "@/components/admin/form-kit";

/** MCP server list + editor. One form, reused for create and edit. */

export function McpServerManager({ servers }: { servers: McpServerView[] }) {
  const t = useT();
  const [editing, setEditing] = useState<McpServerView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveMcpServerAction(formData);
      if (result.ok) {
        setEditing(null);
        setMessage(t("common.saved"));
      } else {
        setMessage(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <form action={submit} className="washi-panel space-y-3 p-4">
        <input type="hidden" name="id" value={editing?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="name" label={t("admin.mcp.name")}>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              required
              placeholder="internal-tools"
              className="input"
            />
          </FormField>
          <FormField name="url" label={t("admin.mcp.url")}>
            <input
              name="url"
              type="url"
              defaultValue={editing?.url ?? ""}
              required
              placeholder="https://mcp.example.com/mcp"
              className="input"
            />
          </FormField>
          <FormField name="transport" label={t("admin.mcp.transport")}>
            <select name="transport" defaultValue={editing?.transport ?? "http"} className="input">
              <option value="http">Streamable HTTP</option>
              <option value="sse">SSE</option>
            </select>
          </FormField>
          <FormField name="secretRef" label={t("admin.mcp.secretRef")}>
            <input
              name="secretRef"
              defaultValue={editing?.secret_ref ?? ""}
              placeholder="MCP_INTERNAL_TOKEN"
              className="input"
            />
          </FormField>
          <FormField name="allowedTools" label={t("admin.mcp.allowedTools")}>
            <input
              name="allowedTools"
              defaultValue={(editing?.allowed_tools ?? []).join(", ")}
              placeholder="search_orders, refund_order"
              className="input"
            />
          </FormField>
          <label className="flex items-center gap-2 self-end text-sm text-ink-800">
            <input
              type="checkbox"
              name="isEnabled"
              defaultChecked={editing?.is_enabled ?? true}
              className="size-4"
            />
            {t("admin.mcp.enabled")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editing ? t("common.save") : t("admin.mcp.add")}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="h-10 rounded-xl border border-ink-900/15 px-4 text-sm text-ink-800"
            >
              {t("common.cancel")}
            </button>
          ) : null}
          {message ? <span className="text-sm text-ink-700">{message}</span> : null}
        </div>
      </form>

      <ul className="space-y-2">
        {servers.map((server) => (
          <li key={server.id} className="washi-panel flex flex-wrap items-center gap-3 p-3">
            <Plug className="size-4 text-jade-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{server.name}</p>
              <p className="truncate text-xs text-ink-700/70">{server.url}</p>
              {server.last_probe_ok === false ? (
                <p className="text-xs text-vermilion-700">{server.last_probe_error}</p>
              ) : null}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                server.is_enabled ? "bg-jade-600/15 text-jade-700" : "bg-ink-900/10 text-ink-700"
              }`}
            >
              {server.is_enabled ? t("admin.mcp.enabled") : t("admin.mcp.disabled")}
            </span>
            <button
              type="button"
              onClick={() => setEditing(server)}
              className="text-xs font-medium text-vermilion-600"
            >
              {t("common.edit")}
            </button>
            <ProbeButton id={server.id} />
            <DeleteButton id={server.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProbeButton({ id }: { id: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          startTransition(async () => {
            const res = await probeMcpServerAction(formData);
            setResult(
              res.ok && res.data?.ok
                ? `${res.data.toolCount} tools`
                : (res.ok ? res.data?.error : res.error.message) ?? "failed",
            );
          });
        }}
        className="text-xs font-medium text-ink-700"
      >
        {pending ? "…" : t("admin.mcp.test")}
      </button>
      {result ? <span className="text-xs text-ink-700/70">{result}</span> : null}
    </>
  );
}

function DeleteButton({ id }: { id: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("common.delete")}
      onClick={() => {
        const formData = new FormData();
        formData.set("id", id);
        startTransition(async () => {
          await deleteMcpServerAction(formData);
        });
      }}
      className="text-vermilion-600"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  );
}
