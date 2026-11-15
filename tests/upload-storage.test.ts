/**
 * `uploadMenuImageAction` writes dish photos to the deployment's own storage.
 *
 * The bug this guards: every uploaded photo used to go to Supabase Storage, whose
 * egress is the quota that 402'd the whole project. The action now prefers the
 * R2 binding and only falls back to Supabase when that binding is absent (R2 not
 * yet enabled). Both paths must produce a URL the site can render.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() => vi.fn(async () => ({})));
const upload = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const getPublicUrl = vi.hoisted(() => vi.fn(() => ({ data: { publicUrl: "https://supabase.example/dish.png" } })));
const bindings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/lib/auth/session", () => ({
  assertCapability: async () => ({ actorId: "abcdef12", role: "owner" }),
}));
vi.mock("@/lib/d1/database", () => ({
  getCloudflareBindings: () => bindings.value,
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: async () => ({ storage: { from: () => ({ upload, getPublicUrl }) } }),
}));

import { uploadMenuImageAction } from "@/lib/actions/storage";

function file(type = "image/png", bytes = 16): FormData {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(bytes)], "dish.png", { type }));
  return form;
}

beforeEach(() => {
  put.mockClear();
  upload.mockClear();
  bindings.value = {};
});

describe("uploadMenuImageAction", () => {
  it("writes to R2 and returns the media-worker URL when the bucket is bound", async () => {
    bindings.value = { MEDIA_BUCKET: { put } };

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.url).toMatch(/^https:\/\/panda-wok-media\.\w+\.workers\.dev\/media\/dish-/);
    expect(put).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
  });

  it("falls back to Supabase Storage when R2 is not bound", async () => {
    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.url).toBe("https://supabase.example/dish.png");
    expect(upload).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });

  it("reports an upload failure rather than saving a URL that points nowhere", async () => {
    bindings.value = { MEDIA_BUCKET: { put: vi.fn(async () => { throw new Error("bucket gone"); }) } };

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain("bucket gone");
  });

  it("rejects a non-image and an oversized file before any write", async () => {
    bindings.value = { MEDIA_BUCKET: { put } };

    const wrongType = await uploadMenuImageAction(file("text/plain"));
    expect(wrongType.ok).toBe(false);

    const tooBig = await uploadMenuImageAction(file("image/png", 9 * 1024 * 1024));
    expect(tooBig.ok).toBe(false);

    expect(put).not.toHaveBeenCalled();
  });
});
