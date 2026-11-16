/**
 * `uploadMenuImageAction` writes dish photos to DBByte object storage.
 *
 * The bug this guards: every uploaded photo used to go to Supabase Storage, whose
 * egress is the quota that 402'd the whole project. Uploads now go to DBByte and
 * are served back through the media Worker, so the store stays private and no
 * key ever reaches the browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const formDataAppend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  assertCapability: async () => ({ actorId: "abcdef12", role: "owner" }),
}));

import { uploadMenuImageAction } from "@/lib/actions/storage";

function file(type = "image/png", bytes = 16): FormData {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(bytes)], "dish.png", { type }));
  return form;
}

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  formDataAppend.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.DBBYTE_KEY = "dbk_test_key";
  process.env.DBBYTE_BUCKET = "panda-wok-media";
});

describe("uploadMenuImageAction", () => {
  it("posts the file to DBByte and returns the media-worker URL", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.url).toMatch(
      /^https:\/\/panda-wok-media\.[\w.]+workers\.dev\/media\/dish-abcdef12-[0-9a-f-]{36}\.png$/,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dbbyte.com/storage/panda-wok-media/upload");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer dbk_test_key" });
  });

  it("reports a storage failure rather than saving a URL that points nowhere", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain("500");
  });

  it("reports an unreachable store without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
  });

  it("refuses to upload when the store key is not configured", async () => {
    delete process.env.DBBYTE_KEY;

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image and an oversized file before any write", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const wrongType = await uploadMenuImageAction(file("text/plain"));
    expect(wrongType.ok).toBe(false);

    const tooBig = await uploadMenuImageAction(file("image/png", 9 * 1024 * 1024));
    expect(tooBig.ok).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
