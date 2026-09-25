import { describe, expect, it } from "vitest";
import { escapeLike } from "@/lib/utils/format";
import { LOGIN_ID_HINT, loginIdPattern } from "@/lib/validation/schemas";

/**
 * The staff `login_id` is the credential a worker types at /admin. It is matched
 * case-insensitively with `ilike`, so the two rules below are what stop a
 * wildcard secret from unlocking a console it does not belong to.
 */
describe("escapeLike", () => {
  it("turns a lone wildcard into a literal", () => {
    expect(escapeLike("%")).toBe("\\%");
    expect(escapeLike("_")).toBe("\\_");
    expect(escapeLike("*")).toBe("\\*");
  });

  it("escapes wildcards inside a real id without touching the rest", () => {
    expect(escapeLike("01099887766")).toBe("01099887766");
    expect(escapeLike("kitchen_1")).toBe("kitchen\\_1");
    expect(escapeLike("a%b")).toBe("a\\%b");
  });

  it("escapes the escape character itself so it cannot cancel a wildcard", () => {
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });
});

describe("loginIdPattern", () => {
  it("accepts the ids an owner would realistically issue", () => {
    for (const id of ["01099887766", "cashier-01", "kitchen_2", "ahmed@wok", "مدير"]) {
      expect(loginIdPattern.test(id)).toBe(true);
    }
  });

  it("rejects characters that could break out of the PostgREST filter", () => {
    for (const id of ["%", "*", "a%b", "%' or 1=1", "a,b", "a(b)", 'a"b']) {
      expect(loginIdPattern.test(id)).toBe(false);
    }
  });

  it("allows a literal underscore but escapes it so it cannot act as a wildcard", () => {
    expect(loginIdPattern.test("kitchen_2")).toBe(true);
    expect(escapeLike("kitchen_2")).toBe("kitchen\\_2");
  });

  it("documents the allowed set for the owner", () => {
    expect(LOGIN_ID_HINT).toContain("letters");
  });
});
