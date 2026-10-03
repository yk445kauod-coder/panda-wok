import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/**
 * Pure translator, free of Next.js request APIs so it can be imported by
 * server components, server actions and the client provider alike.
 *
 * `t("menu.title")` walks the dictionary by dotted path; `{name}` placeholders
 * in the value are filled from the second argument. A missing key returns the
 * key itself, which keeps a forgotten translation visible (and debuggable)
 * instead of throwing in the middle of a render.
 */
export function translate(
  dict: Dictionary,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const raw = path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      dict,
    );

  if (typeof raw !== "string") return path;
  if (!vars) return raw;

  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type Translator = (
  path: string,
  vars?: Record<string, string | number>,
) => string;

export function makeTranslator(dict: Dictionary): Translator {
  return (path, vars) => translate(dict, path, vars);
}
