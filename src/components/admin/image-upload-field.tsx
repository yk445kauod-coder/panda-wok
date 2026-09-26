"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, LinkIcon, RotateCcw } from "lucide-react";
import { uploadMenuImageAction } from "@/lib/actions/storage";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/utils/format";

const ACCEPTED = "image/png,image/jpeg,image/webp,image/avif";

/**
 * Dish/category photo control. Two ways in, one value out:
 *
 *  - Upload: pushes the file into the public Supabase `menu-images` bucket
 *    server-side (capability-checked; ≤8 MB; PNG/JPEG/WebP/AVIF) and returns
 *    the public URL.
 *  - Paste: the admin pastes any reachable image URL (an existing CDN link, a
 *    supplier's photo) and it is used as-is.
 *
 * Both paths write the same hidden `imageUrl` input the enclosing form posts,
 * so the server never needs to know which one was used. A manual URL is only
 * accepted when it parses as http(s), so a typo cannot silently save a broken
 * image.
 */
export function ImageUploadField({
  name = "imageUrl",
  initialUrl,
  idSuffix,
}: {
  name?: string;
  initialUrl: string | null;
  idSuffix?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [url, setUrl] = useState<string>(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function applyUrl(next: string, { fromFile }: { fromFile: boolean }) {
    const trimmed = next.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setError("Image address must start with http:// or https://");
      return;
    }
    setError(null);
    setUrl(trimmed);
    setPreview(trimmed || null);
    if (fromFile && fileRef.current) fileRef.current.value = "";
  }

  function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("PNG, JPEG, WebP or AVIF only.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be at most 8 MB.");
      return;
    }
    setError(null);
    const blobUrl = URL.createObjectURL(file);
    setPreview(blobUrl);
    setBusy(true);
    const fd = new FormData();
    fd.append("image", file);
    startTransition(async () => {
      try {
        const res = await uploadMenuImageAction(fd);
        if (res.ok) {
          applyUrl(res.data.url, { fromFile: true });
        } else {
          setError(res.error.message);
          setPreview(url || null);
        }
      } catch {
        // A rejected action (rather than a returned failure) means the request
        // never reached the handler — an oversized body, a dropped connection, a
        // stale deployment. Without this the promise rejected silently and the
        // button stayed on the spinner, which is what "it crashes" looked like.
        setError("Upload did not reach the server. Check your connection and try again.");
        setPreview(url || null);
      } finally {
        setBusy(false);
        URL.revokeObjectURL(blobUrl);
      }
    });
  }

  return (
    <div className="space-y-2">
      {/* Single source of truth for what the form posts. A controlled input, so
          the value always reflects the upload result or the pasted URL. */}
      <input type="hidden" name={name} value={url} readOnly />

      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-dashed border-ink-900/25 bg-rice-100"
          aria-label="Choose or replace the dish photo"
        >
          {preview ? (
            // Local blob or a remote host the admin pasted; plain img keeps the
            // small thumbnail simple (next/image needs a fixed host allow-list).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center gap-1 text-ink-700/70">
              <ImagePlus className="size-5" />
              <span className="text-2xs font-medium">Photo</span>
            </span>
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-ink-900/40 text-rice-50">
              <Spinner />
            </span>
          ) : null}
          {preview ? (
            <span className="absolute end-1 top-1 rounded bg-ink-900/70 px-1 py-0.5 text-2xs text-rice-50">
              Change
            </span>
          ) : null}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            key={idSuffix ?? "menu"}
            type="file"
            accept={ACCEPTED}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-sm file:text-rice-50 hover:file:bg-ink-800"
            onChange={(event) => pick(event.target.files?.[0])}
          />

          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-11 items-center rounded-l-xl border border-e-0 border-ink-900/12 bg-rice-200/60 px-2 text-ink-700/70"
            >
              <LinkIcon className="size-3.5" />
            </span>
            <input
              type="url"
              inputMode="url"
              value={url}
              placeholder="…or paste an image URL (https://…)"
              onChange={(event) => applyUrl(event.target.value, { fromFile: false })}
              className={cn(
                "h-11 w-full rounded-e-xl border bg-rice-50 px-3 text-sm outline-none focus:border-miso-500",
                error ? "border-chili-500" : "border-ink-900/12",
              )}
            />
          </div>

          <p className="text-2xs text-ink-700/65">
            Upload to the app&rsquo;s storage, or paste a link. Max 8 MB; PNG/JPEG/WebP/AVIF.
          </p>
          {error ? <p className="text-2xs text-red-700">{error}</p> : null}
          {preview && !busy ? (
            <button
              type="button"
              onClick={() => applyUrl("", { fromFile: true })}
              className="inline-flex items-center gap-1 text-2xs text-ink-700/70 hover:text-ink-900"
            >
              <RotateCcw className="size-3" />
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}