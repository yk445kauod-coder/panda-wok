import { describe, expect, it } from "vitest";
import {
  canonicalPhone,
  phoneLookupCandidates,
  phoneNationalDigits,
} from "@/lib/utils/phone";
import { placeholderEmailFor, pickSignInEmail } from "@/lib/auth/phone";

describe("canonicalPhone", () => {
  it("canonicalises the Egyptian national form", () => {
    expect(canonicalPhone("01277593815")).toBe("+201277593815");
  });

  it("collapses every common spelling of one number", () => {
    const expected = "+201277593815";
    for (const input of [
      "01277593815",
      "1277593815",
      "+201277593815",
      "00201277593815",
      "0127 759 3815",
      "+20 127 759 3815",
    ]) {
      expect(canonicalPhone(input)).toBe(expected);
    }
  });

  it("rejects values with no plausible subscriber number", () => {
    expect(canonicalPhone("abc")).toBeNull();
    expect(canonicalPhone("123")).toBeNull();
    expect(canonicalPhone("")).toBeNull();
  });
});

describe("phoneLookupCandidates", () => {
  it("includes the legacy raw national form and canonical E.164", () => {
    const candidates = phoneLookupCandidates("+201277593815");
    expect(candidates).toContain("01277593815");
    expect(candidates).toContain("201277593815");
    expect(candidates).toContain("+201277593815");
    expect(candidates).toContain("1277593815");
  });
});

describe("placeholderEmailFor", () => {
  it("is deterministic across phone spellings", () => {
    expect(placeholderEmailFor("01277593815")).toBe(
      placeholderEmailFor("+20 127 759 3815"),
    );
  });

  it("uses the last ten digits", () => {
    expect(placeholderEmailFor("+201277593815")).toBe(
      "panda-1277593815@example.com",
    );
  });
});

describe("phoneNationalDigits", () => {
  it("takes the final ten digits", () => {
    expect(phoneNationalDigits("+201277593815")).toBe("1277593815");
    expect(phoneNationalDigits("01277593815")).toBe("1277593815");
  });
});

describe("pickSignInEmail", () => {
  it("returns a typed email unchanged, trimmed", () => {
    expect(pickSignInEmail("  Madrasty61@Gmail.com ", null)).toBe(
      "Madrasty61@Gmail.com",
    );
  });

  it("prefers the account's real email when signing in with a phone", () => {
    expect(pickSignInEmail("01277593815", "madrasty61@gmail.com")).toBe(
      "madrasty61@gmail.com",
    );
  });

  it("falls back to the placeholder for a genuinely phone-first account", () => {
    expect(pickSignInEmail("01277593815", null)).toBe(
      placeholderEmailFor("01277593815"),
    );
  });

  it("ignores a placeholder stored on the profile", () => {
    expect(pickSignInEmail("01277593815", placeholderEmailFor("01277593815"))).toBe(
      placeholderEmailFor("01277593815"),
    );
  });

  it("maps every phone spelling to the same account", () => {
    const expected = "madrasty61@gmail.com";
    for (const input of ["01277593815", "+201277593815", "0127 759 3815"]) {
      expect(pickSignInEmail(input, expected)).toBe(expected);
    }
  });
});
