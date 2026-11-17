/**
 * `uploadMenuImageAction` writes dish photos to DBByte object storage over S3.
 *
 * The bug this guards: every uploaded photo used to go to Supabase Storage, whose
 * egress is the quota that 402'd the whole project. Uploads now go to DBByte
 * (S3 PUT, SigV4-signed) and are served back through the media Worker, so the
 * store stays private and no key ever reaches the browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
const awsFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  assertCapability: async () => ({ actorId: "abcdef12", role: "owner" }),
}));

// The action signs through `aws4fetch`; stub it so the test asserts the URL and
// the request shape the action builds, not the signature bytes.
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = awsFetchMock;
  },
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
  awsFetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.DBBYTE_ACCESS_KEY_ID = "dbs_test_key_id";
  process.env.DBBYTE_SECRET_ACCESS_KEY = "dbk_test_key";
  process.env.DBBYTE_BUCKET = "panda-wok-media";
});

describe("uploadMenuImageAction", () => {
  it("PUTs the file to DBByte S3 and returns the media-worker URL", async () => {
    awsFetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.url).toMatch(
      /^https:\/\/panda-wok-media\.[\w.]+workers\.dev\/media\/dish-abcdef12-[0-9a-f-]{36}\.png$/,
    );
    expect(awsFetchMock).toHaveBeenCalledOnce();
    const [url, init] = awsFetchMock.mock.calls[0];
    expect(String(url)).toMatch(
      /^https:\/\/s3\.dbbyte\.com\/panda-wok-media\/dish-abcdef12-[0-9a-f-]{36}\.png$/,
    );
    expect((init as RequestInit).method).toBe("PUT");
    expect((init as RequestInit).headers).toMatchObject({ "content-type": "image/png" });
    expect((init as RequestInit).body).toBeInstanceOf(ArrayBuffer);
  });

  it("reports a storage failure rather than saving a URL that points nowhere", async () => {
    awsFetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail).toContain("500");
  });

  it("reports an unreachable store without throwing", async () => {
    awsFetchMock.mockRejectedValue(new Error("network down"));

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
  });

  it("refuses to upload when the store key is not configured", async () => {
    delete process.env.DBBYTE_SECRET_ACCESS_KEY;

    const result = await uploadMenuImageAction(file());

    expect(result.ok).toBe(false);
    expect(awsFetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image and an oversized file before any write", async () => {
    awsFetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const wrongType = await uploadMenuImageAction(file("text/plain"));
    expect(wrongType.ok).toBe(false);

    const tooBig = await uploadMenuImageAction(file("image/png", 9 * 1024 * 1024));
    expect(tooBig.ok).toBe(false);

    expect(awsFetchMock).not.toHaveBeenCalled();
  });
});
