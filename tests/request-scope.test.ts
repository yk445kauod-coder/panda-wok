import { describe, expect, it } from "vitest";
import { inRequestScope, memo, takeToken, withRequestScope } from "@/lib/request-scope";
import { MAX_DOCUMENTS_PER_TURN } from "@/lib/agent/registry";

/**
 * The subrequest budget is what keeps a document-making turn alive on a Worker.
 * Cloudflare caps subrequests per invocation (50 free), and a turn that makes
 * three documents was measured at 54 before this scope existed — the runtime
 * killed the invocation mid-render, the artifact stayed `building`, and the UI
 * could only show a generic error.
 */
describe("request scope", () => {
  it("runs a loader once per scope", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };

    await withRequestScope(async () => {
      const [a, b] = await Promise.all([memo("k", load), memo("k", load)]);
      expect(a).toBe(1);
      expect(b).toBe(1);
    });

    expect(calls).toBe(1);
  });

  it("does not share across scopes", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };

    await withRequestScope(() => memo("k", load));
    await withRequestScope(() => memo("k", load));
    expect(calls).toBe(2);
  });

  it("retries after a failure instead of caching it", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return "ok";
    };

    await withRequestScope(async () => {
      await expect(memo("k", load)).rejects.toThrow("transient");
      await expect(memo("k", load)).resolves.toBe("ok");
    });
    expect(calls).toBe(2);
  });

  it("calls the loader directly outside a scope", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };

    expect(inRequestScope()).toBe(false);
    await memo("k", load);
    await memo("k", load);
    expect(calls).toBe(2);
  });

  it("caps a named token inside a scope and ignores it outside", async () => {
    await withRequestScope(() => {
      const results = Array.from({ length: MAX_DOCUMENTS_PER_TURN + 2 }, () =>
        takeToken("create_document", MAX_DOCUMENTS_PER_TURN),
      );
      expect(results.filter(Boolean)).toHaveLength(MAX_DOCUMENTS_PER_TURN);
      expect(results.at(-1)).toBe(false);
    });

    // No scope: a script or test is never throttled.
    expect(takeToken("create_document", MAX_DOCUMENTS_PER_TURN)).toBe(true);
  });

  it("allows each document kind once, so a repeated call cannot duplicate it", async () => {
    // Live: a weak model repeated create_document for the same slide_deck and
    // saved the identical file twice. The per-kind key blocks the repeat while
    // still letting a genuinely different document through.
    await withRequestScope(() => {
      expect(takeToken("create_document:slide_deck:default", 1)).toBe(true);
      expect(takeToken("create_document:slide_deck:default", 1)).toBe(false);
      expect(takeToken("create_document:sales_dashboard:default", 1)).toBe(true);
    });
  });

  it("treats the same kind in different formats as different documents", async () => {
    await withRequestScope(() => {
      expect(takeToken("create_document:weekly_kpi:pdf", 1)).toBe(true);
      expect(takeToken("create_document:weekly_kpi:xlsx", 1)).toBe(true);
      expect(takeToken("create_document:weekly_kpi:pdf", 1)).toBe(false);
    });
  });
});
