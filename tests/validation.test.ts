import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema, addressSchema } from "@/lib/validation/schemas";

function signup(overrides: Record<string, unknown> = {}) {
  return signUpSchema.safeParse({
    fullName: "Yousef Madboly",
    phone: "01277593815",
    email: "",
    password: "correct horse battery",
    locale: "en",
    marketingOptIn: false,
    ...overrides,
  });
}

describe("signUpSchema", () => {
  it("accepts a valid phone-first payload and canonicalises the phone", () => {
    const result = signup();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+201277593815");
      expect(result.data.email).toBeUndefined();
    }
  });

  it("accepts a real email and lowercases nothing destructive", () => {
    const result = signup({ email: "madrasty61@gmail.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("madrasty61@gmail.com");
  });

  it("rejects a missing name", () => {
    expect(signup({ fullName: "" }).success).toBe(false);
  });

  it("rejects a missing phone", () => {
    const result = signUpSchema.safeParse({
      fullName: "A B",
      phone: "",
      password: "correct horse battery",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(signup({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a short password", () => {
    expect(signup({ password: "short" }).success).toBe(false);
  });

  it("rejects an invalid phone format", () => {
    const result = signUpSchema.safeParse({
      fullName: "A B",
      phone: "call-me-maybe",
      password: "correct horse battery",
    });
    expect(result.success).toBe(false);
  });

  it("defaults an unknown locale to en and accepts ar", () => {
    const en = signup({ locale: undefined });
    expect(en.success).toBe(true);
    if (en.success) expect(en.data.locale).toBe("en");
    const ar = signup({ locale: "ar" });
    if (ar.success) expect(ar.data.locale).toBe("ar");
  });
});

describe("signInSchema", () => {
  it("accepts an email identifier", () => {
    expect(
      signInSchema.safeParse({ email: "a@b.com", password: "12345678" }).success,
    ).toBe(true);
  });

  it("accepts a phone identifier", () => {
    expect(
      signInSchema.safeParse({ email: "01277593815", password: "12345678" }).success,
    ).toBe(true);
  });

  it("rejects an empty identifier and a short password", () => {
    expect(signInSchema.safeParse({ email: "", password: "12345678" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("canonicalises the contact phone too", () => {
    const result = addressSchema.safeParse({
      label: "Home",
      contactName: "Yousef",
      contactPhone: "01277593815",
      addressLine: "12 Corniche Road",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contactPhone).toBe("+201277593815");
  });
});
