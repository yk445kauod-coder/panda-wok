"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { uploadMenuImageAction } from "@/lib/actions/storage";
import { Spinner } from "@/components/ui/button";

const ACCEPTED = "image/png,image/jpeg,image/webp,image/avif";

/**
 * Direct upload for a dish photo. Choosing a file shows a live preview and
 * "Upload" pushes it into the Supabase `menu-images` bucket (server-side;
 * capability-checked; ≤8 MB; PNG/JPEG/WebP/AVIF). The resulting public URL
 * lands in a hidden `imageUrl` inputthat the enclosing menu/category form posts
 * as its image field — no manual URL pasting, no external host.
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("PNG, JPEG, WebP or AVIF only.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must beat most 8 MB.");
      return;
    }
    setError(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    const fd = new FormData();
    fd.append("image", file);
    startTransition(async () => {
      const res = await uploadMenuImageAction(fd);
      setBusy(false);
      if (res.ok) {
        setPreview(res.data.url);
        if (inputRef.current) inputRef.current.value = res.data.url;

      } else {
        setError(res.error.message);
        if (initialUrl) setPreview(initialUrl);
        else setPreview(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      <input
        type="hidden"
        name={name}
        ref={inputRef}
        defaultValue={initialUrl ?? ""}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
          className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-dashed border-ink-900/25 bg-rice-100"
          aria-label="Choose or replace the dish photo"
        >
          {preview ? (
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

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            key={idSuffix ?? "menu"}
            type="file"
            accept={ACCEPTED}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-sm file:text-rice-50 hover:file:bg-ink-800"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <p className="text-2xs text-ink-700/65">
            Uploads to the app&rsquo;s storage — you get the public URL back here. No manual pasting. Max 8 MB, PNG/JPEG/WebP/AVIF.

          </p>
          {error ? <p className="text-2xs text-red-700">{error}</p> : null}
          {preview && !busy ? (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
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