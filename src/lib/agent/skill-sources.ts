import "server-only";
import { indexSkillDocument } from "@/lib/agent/skills";

/**
 * Skill ingestion.
 *
 * Skills are fetched as plain markdown and chunked by `indexSkillDocument`, so
 * what reaches the model later is a handful of lines rather than the document.
 *
 * Fetching is deliberately restricted to the sources the product actually uses —
 * GitHub raw content — for two reasons:
 *
 *   1. SSRF. An operator typing a URL must not be able to make the Worker fetch
 *      `http://169.254.169.254/…` or an internal host. Only `github.com` and
 *      `raw.githubusercontent.com` over https are accepted, and the redirect is
 *      disabled so a 302 cannot bounce the request somewhere else.
 *   2. Predictability. A skill that disappears because a blog moved is worse
 *      than no skill; a pinned raw URL from a repo is stable.
 *
 * `parseGithubSkillUrl` accepts the shapes a person actually pastes:
 *   https://github.com/owner/repo/blob/main/skills/foo/SKILL.md
 *   https://github.com/owner/repo/tree/main/skills/foo
 *   https://raw.githubusercontent.com/owner/repo/main/skills/foo/SKILL.md
 */

const ALLOWED_HOSTS = new Set(["github.com", "raw.githubusercontent.com"]);
const MAX_BYTES = 200_000;

export type RemoteSkillRef = { name: string; sourceUrl: string; fetchUrl: string };

/** Normalises a pasted GitHub URL into a fetchable raw URL. Null when unusable. */
export function parseGithubSkillUrl(input: string): RemoteSkillRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) return null;

  const parts = url.pathname.split("/").filter(Boolean);

  // raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...>
  if (url.host === "raw.githubusercontent.com") {
    if (parts.length < 4) return null;
    const path = parts.slice(3).join("/");
    if (!path.endsWith(".md")) return null;
    return {
      name: `github:${parts[0]}/${parts[1]}/${path}`,
      sourceUrl: `https://github.com/${parts[0]}/${parts[1]}/blob/${parts[2]}/${path}`,
      fetchUrl: url.toString(),
    };
  }

  // github.com/<owner>/<repo>/(blob|tree)/<ref>/<path...>
  const [owner, repo, kind, ref, ...rest] = parts;
  if (!owner || !repo || !ref || (kind !== "blob" && kind !== "tree")) return null;

  let path = rest.join("/");
  if (kind === "tree") {
    // A tree URL names a directory; the skill document inside it is SKILL.md.
    path = path ? `${path}/SKILL.md` : "SKILL.md";
  } else if (!path.endsWith(".md")) {
    // A blob URL names a file. Anything but markdown is refused rather than
    // silently fetched — a `.env` or a script is not a skill.
    return null;
  }

  return {
    name: `github:${owner}/${repo}/${path}`,
    sourceUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${path}`,
    fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
  };
}

/** Fetches one markdown document, enforcing the host allow-list and a size cap. */
async function fetchMarkdown(ref: RemoteSkillRef): Promise<string | null> {
  try {
    const response = await fetch(ref.fetchUrl, {
      // No redirects: a 302 is exactly how an allow-listed host escapes the list.
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "text/plain, text/markdown" },
    });
    if (!response.ok) return null;
    const text = await response.text();
    // Guard against a pathological file; a skill is instructions, not a dataset.
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  }
}

/**
 * Indexes a curated set of sources. Returns per-source results so the console can
 * say exactly what was (and was not) loaded — a silent failure here would look
 * like "the agent ignored my skill".
 */
export async function syncSkillSources(
  sources: { name: string; source: string; text: string }[],
): Promise<{ name: string; chunks: number; ok: boolean }[]> {
  const results: { name: string; chunks: number; ok: boolean }[] = [];
  for (const source of sources) {
    try {
      const chunks = await indexSkillDocument({
        name: source.name,
        source: source.source,
        sourceUrl: null,
        text: source.text,
      });
      results.push({ name: source.name, chunks, ok: true });
    } catch {
      results.push({ name: source.name, chunks: 0, ok: false });
    }
  }
  return results;
}

/** Fetches and indexes one or more pasted GitHub skill URLs. */
export async function importGithubSkills(
  urls: string[],
): Promise<{ input: string; name: string | null; chunks: number; ok: boolean }[]> {
  const results: { input: string; name: string | null; chunks: number; ok: boolean }[] = [];

  for (const input of urls.slice(0, 10)) {
    const ref = parseGithubSkillUrl(input);
    if (!ref) {
      results.push({ input, name: null, chunks: 0, ok: false });
      continue;
    }
    const text = await fetchMarkdown(ref);
    if (!text) {
      results.push({ input, name: ref.name, chunks: 0, ok: false });
      continue;
    }
    try {
      const chunks = await indexSkillDocument({
        name: ref.name,
        source: "github",
        sourceUrl: ref.sourceUrl,
        text,
      });
      results.push({ input, name: ref.name, chunks, ok: true });
    } catch {
      results.push({ input, name: ref.name, chunks: 0, ok: false });
    }
  }
  return results;
}
