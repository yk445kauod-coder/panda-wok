/**
 * A last-known-good copy of each public read, kept in the same KV namespace the
 * incremental cache uses.
 *
 * Why it exists: every storefront page is rendered from Supabase, and Supabase
 * can stop answering for reasons that have nothing to do with this app — the
 * org's egress quota is spent and every call returns 402 until the billing
 * period resets. On a day like that the menu, the basket and the feedback page
 * each answered 500, because a read that throws takes the whole render with it.
 * A customer arriving from an ad sees a broken site, not a menu.
 *
 * The catalogue is small (about 120 KB for the whole menu), changes rarely, and
 * is already cached for ten minutes. So the freshest successful result of each
 * read is written here, and when Supabase fails the last good copy is served
 * instead. The page stays up and the data is at most one revalidation old —
 * strictly better than an error page.
 *
 * Writes are throttled: `unstable_cache` already limits the read to once per
 * revalidation window, and this adds a longer floor so a quiet period cannot
 * spend the Free plan's 1,000 KV writes a day. A failed read is never written,
 * so a transient error cannot become the stored copy.
 *
 * Everything degrades to "no backup" when there is no KV binding (a build, the
 * dev server, a preview without the namespace), so nothing here can break a
 * local run.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { catalogSeed } from "@/lib/cache/seed/catalog-backup";

/** The namespace the incremental cache already uses; no new binding needed. */
const BINDING_NAME = "NEXT_INC_CACHE_KV";
const KEY_PREFIX = "catalog-backup:";

/**
 * How long a stored copy is left alone before it is refreshed. Six hours keeps
 * the whole catalogue under ~60 writes a day (15 keys), far inside the Free
 * plan's 1,000, while never letting the fallback drift more than half a day.
 */
const REFRESH_FLOOR_MS = 6 * 60 * 60 * 1000;

type StoredBackup<T> = { at: number; value: T };

/**
 * A read's own arguments become part of its backup key.
 *
 * Several public reads take an argument — `getMenuItemBySlug(slug)`,
 * `getMenuItemsByCategory(id)` — and they share one `cachedPublic` name. Keying
 * the backup on the name alone would let the last dish read overwrite every
 * other dish's copy, so a fallback for `/menu/wasabi` could serve `/menu/beef`.
 * Serialising the arguments keeps each one separate.
 */
function suffix(args: unknown[]): string {
  if (args.length === 0) return "";
  try {
    return `:${JSON.stringify(args)}`;
  } catch {
    return ":?";
  }
}

type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

/**
 * The copy shipped inside the deployment, extracted from a build that rendered
 * against a healthy Supabase.
 *
 * This is what makes the fallback work during `next build`: the prerender calls
 * these same readers with no KV binding and no request, so on a day Supabase is
 * restricted the build would fail collecting page data. Reading the bundled copy
 * there lets the pages prerender from known-good data instead.
 *
 * It is also the first source for `readBackup` when KV is empty, so a fresh
 * deployment is protected before any successful read has been recorded.
 */
const bundled = catalogSeed as Record<string, StoredBackup<unknown>>;

/** The KV binding for this request, or null when there is none. Never throws. */
function kv(): KvNamespace | null {
  try {
    const binding = getCloudflareContext().env?.[BINDING_NAME];
    return (binding as KvNamespace | undefined) ?? null;
  } catch {
    return null;
  }
}

function keyFor(name: string): string {
  return `${KEY_PREFIX}${name}`;
}

/**
 * The stored copy for `name`, or `undefined` when there is none, it cannot be
 * parsed, or KV is unavailable. Never throws: a corrupt backup must not turn a
 * fallback into a second failure.
 *
 * `undefined` is the "no backup" sentinel rather than `null` because `null` is a
 * real answer for several of these reads — "there is no dish with that slug",
 * "this page has no SEO override". Conflating the two would make the fallback
 * skip exactly the negative answers, so a restricted Supabase would still 500 on
 * every page that legitimately has no row.
 */
export async function readBackup<T>(name: string, args: unknown[] = []): Promise<T | undefined> {
  const fullName = name + suffix(args);
  const namespace = kv();
  if (namespace) {
    try {
      const raw = await namespace.get(keyFor(fullName));
      if (raw) {
        const parsed = JSON.parse(raw) as StoredBackup<T>;
        return parsed.value as T;
      }
    } catch {
      // Fall through to the bundled copy rather than failing the read.
    }
  }
  const fromBundle = bundled[fullName];
  return fromBundle ? (fromBundle.value as T) : undefined;
}

/**
 * Records `value` as the newest known-good copy for `name`, unless the stored
 * one is younger than the refresh floor.
 *
 * The read-then-write is a deliberate best-effort check rather than a
 * transaction: two concurrent renders can both decide to write, and that costs
 * one extra write, which is the outcome we want when the alternative is holding
 * a lock in a hot path.
 */
export async function saveBackup<T>(name: string, value: T, args: unknown[] = []): Promise<void> {
  const namespace = kv();
  // No KV (a build, the dev server): the bundled copy is the fallback, and a
  // value read from it must not be written back.
  if (!namespace) return;
  try {
    const existing = await namespace.get(keyFor(name + suffix(args)));
    if (existing) {
      const parsed = JSON.parse(existing) as StoredBackup<T>;
      if (Date.now() - parsed.at < REFRESH_FLOOR_MS) return;
    }
    await namespace.put(
      keyFor(name + suffix(args)),
      JSON.stringify({ at: Date.now(), value } satisfies StoredBackup<T>),
    );
  } catch {
    // A failed backup write is not worth surfacing: the page already rendered.
  }
}
