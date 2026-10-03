import { describe, expect, it } from "vitest";
import {
  classifyAuthProviderError,
  duplicateKeyColumn,
  isDuplicateKeyError,
  toAppError,
} from "@/lib/utils/errors";

describe("toAppError", () => {
  it("maps a profiles_phone_key unique violation to PHONE_ALREADY_EXISTS", () => {
    const error = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "profiles_phone_key"',
    };
    const result = toAppError(error);
    expect(result.code).toBe("PHONE_ALREADY_EXISTS");
    expect(result.message).toContain("phone number");
  });

  it("maps a profiles_email_key unique violation to EMAIL_ALREADY_EXISTS", () => {
    const error = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "profiles_email_key"',
    };
    expect(toAppError(error).code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("maps a MODIFIER_LIMIT_EXCEEDED raise with its detail", () => {
    const result = toAppError(new Error("MODIFIER_LIMIT_EXCEEDED:Pad Thai"));
    expect(result.code).toBe("MODIFIER_LIMIT_EXCEEDED");
    expect(result.detail).toBe("Pad Thai");
  });

  it("keeps unknown failures as UNKNOWN", () => {
    expect(toAppError(new Error("kaboom")).code).toBe("UNKNOWN");
  });

  it("maps a 42501 privilege failure to FORBIDDEN", () => {
    expect(toAppError({ code: "42501", message: "permission denied" }).code).toBe(
      "FORBIDDEN",
    );
  });
});

describe("isDuplicateKeyError / duplicateKeyColumn", () => {
  it("detects a phone duplicate", () => {
    const error = { code: "23505", message: 'constraint "profiles_phone_key"' };
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(duplicateKeyColumn(error)).toBe("phone");
  });

  it("does not treat a generic error as a duplicate", () => {
    expect(isDuplicateKeyError(new Error("timeout"))).toBe(false);
    expect(duplicateKeyColumn(new Error("timeout"))).toBeNull();
  });
});

describe("classifyAuthProviderError", () => {
  it("classifies an already-registered provider error", () => {
    expect(
      classifyAuthProviderError({
        code: "user_already_exists",
        message: "User already registered",
      }),
    ).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("classifies a provider rate limit", () => {
    expect(
      classifyAuthProviderError({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
      }),
    ).toBe("RATE_LIMITED");
  });

  it("classifies a disabled provider", () => {
    expect(
      classifyAuthProviderError({
        code: "email_provider_disabled",
        message: "Email signups are disabled",
      }),
    ).toBe("AUTH_PROVIDER_NOT_CONFIGURED");
  });

  it("classifies a trigger failure surfaced as unexpected_failure", () => {
    expect(
      classifyAuthProviderError({
        code: "unexpected_failure",
        message: "Database error saving new user",
      }),
    ).toBe("PROFILE_CREATE_FAILED");
  });

  it("classifies a raw duplicate-key phone error", () => {
    expect(
      classifyAuthProviderError({
        code: "23505",
        message: 'constraint "profiles_phone_key"',
      }),
    ).toBe("PHONE_ALREADY_EXISTS");
  });
});
