"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plug, Plus, Trash2 } from "lucide-react";
import {
  deleteMcpServerAction,
  installMcpPresetAction,
  probeMcpServerAction,
  saveMcpSecretAction,
  saveMcpServerAction,
} from "@/lib/actions/agent-ops";
import type { McpServerView } from "@/lib/services/agent-ops";
import { MCP_PRESETS, getMcpPreset } from "@/lib/agent/mcp-presets";
import { useT } from "@/components/i18n-provider";
import { Field as FormField } from "@/components/admin/form-kit";

/** A known connector's display detail, when a server row matches a preset id. */
function presetFor(name: string) {
  return getMcpPreset(name);
}

/** MCP server list + editor. One form, reused for create and edit. */

export function McpServerManager({ servers }: { servers: McpServerView[] }) {
  const t = useT();
  const [editing, setEditing] = useState<McpServerView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const installed = new Set(servers.map((s) => s.name));
  const available = MCP_PRESETS.filter((p) => !installed.has(p.id));

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

  function install(presetId: string) {
    setMessage(null);
    const formData = new FormData();
    formData.set("preset", presetId);
    startTransition(async () => {
      const result = await installMcpPresetAction(formData);
      setMessage(result.ok ? t("admin.agent.mcp.installed") : result.error.message);
    });
  }

  return (
    <div className="space-y-5">
      {available.length > 0 ? (
        <section className="washi-panel space-y-3 p-4">
          <div>
            <h2 className="font-display text-lg text-ink-900">{t("admin.agent.mcp.catalogTitle")}</h2>
            <p className="text-sm text-ink-700/80">{t("admin.agent.mcp.catalogHint")}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((preset) => (
              <li
                key={preset.id}
                className="flex flex-col gap-2 rounded-xl border border-ink-900/10 bg-rice-50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink-900">{preset.name}</p>
                  <span className="rounded-full bg-ink-900/8 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-700">
                    {preset.category}
                  </span>
                </div>
                <p className="text-xs text-ink-700/85">{preset.description}</p>
                <p className="text-[11px] text-ink-700/60">{preset.note}</p>
                <div className="mt-auto flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => install(preset.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-vermilion-600 px-3 text-xs font-medium text-rice-50 disabled:opacity-50"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("admin.agent.mcp.addConnector")}
                  </button>
                  <a
                    href={preset.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-medium text-ink-700 underline"
                  >
                    {t("admin.agent.mcp.docs")}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form action={submit} className="washi-panel space-y-3 p-4">
        <input type="hidden" name="id" value={editing?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="name" label={t("admin.agent.mcp.name")}>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              required
              placeholder="internal-tools"
              className="input"
            />
          </FormField>
          <FormField name="url" label={t("admin.agent.mcp.url")}>
            <input
              name="url"
              type="url"
              defaultValue={editing?.url ?? ""}
              required
              placeholder="https://mcp.example.com/mcp"
              className="input"
            />
          </FormField>
          <FormField name="transport" label={t("admin.agent.mcp.transport")}>
            <select name="transport" defaultValue={editing?.transport ?? "http"} className="input">
              <option value="http">Streamable HTTP</option>
              <option value="sse">SSE</option>
            </select>
          </FormField>
          <FormField name="authHeader" label={t("admin.agent.mcp.authHeader")}>
            <input
              name="authHeader"
              defaultValue={editing?.auth_header ?? "authorization"}
              placeholder="authorization"
              className="input"
            />
          </FormField>
          <FormField name="secretRef" label={t("admin.agent.mcp.secretRef")}>
            <input
              name="secretRef"
              defaultValue={editing?.secret_ref ?? ""}
              placeholder="MCP_INTERNAL_TOKEN"
              className="input"
            />
          </FormField>
          <FormField name="allowedTools" label={t("admin.agent.mcp.allowedTools")}>
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
            {t("admin.agent.mcp.enabled")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-vermilion-600 px-4 text-sm font-medium text-rice-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editing ? t("common.save") : t("admin.agent.mcp.add")}
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
          <li key={server.id} className="washi-panel space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Plug className="size-4 text-jade-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">
                  {presetFor(server.name)?.name ?? server.name}
                </p>
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
                {server.is_enabled ? t("admin.agent.mcp.enabled") : t("admin.agent.mcp.disabled")}
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
            </div>
            {server.secret_ref ? <SecretField id={server.id} ref_={server.secret_ref} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Writes a connector's credential to Vault. The input is a password field and
 * is never echoed back — the server stores only the secret name, so there is
 * nothing to repopulate.
 */
function SecretField({ id, ref_ }: { id: string; ref_: string }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("value", value);
    startTransition(async () => {
      const result = await saveMcpSecretAction(formData);
      if (result.ok) {
        setValue("");
        setSaved(true);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink-900/8 pt-2">
      <label className="text-xs text-ink-700" htmlFor={`secret-${id}`}>
        {t("admin.agent.mcp.token")} <code className="text-ink-900">{ref_}</code>
      </label>
      <input
        id={`secret-${id}`}
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="••••••••"
        className="input h-9 flex-1 min-w-40"
      />
      <button
        type="button"
        disabled={pending || value.length < 8}
        onClick={save}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-ink-900/15 px-3 text-xs font-medium text-ink-800 disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
        {t("common.save")}
      </button>
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
        {pending ? "…" : t("admin.agent.mcp.test")}
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
