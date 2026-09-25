import { describe, expect, it } from "vitest";
import {
  formatDetectedAddress,
  mergeDetectedAddress,
  type EditedFields,
} from "@/lib/utils/address-fill";

const untouched: EditedFields = { area: false, addressLine: false, city: false };
const empty = { area: "", addressLine: "", city: "Alexandria" };

describe("mergeDetectedAddress", () => {
  it("fills the empty fields from a detected address", () => {
    const next = mergeDetectedAddress(
      empty,
      { area: "Sidi Gaber", street: "7 Ahmed Orabi St", city: "Alexandria" },
      untouched,
    );
    expect(next).toEqual({
      area: "Sidi Gaber",
      addressLine: "7 Ahmed Orabi St",
      city: "Alexandria",
    });
  });

  it("keeps what the customer typed when they moved the pin afterwards", () => {
    const next = mergeDetectedAddress(
      { area: "Miami", addressLine: "My own wording", city: "Alexandria" },
      { area: "Sidi Gaber", street: "7 Ahmed Orabi St", city: "Cairo" },
      { area: true, addressLine: true, city: true },
    );
    expect(next).toEqual({
      area: "Miami",
      addressLine: "My own wording",
      city: "Alexandria",
    });
  });

  it("leaves a missing part of the lookup alone instead of blanking the field", () => {
    const next = mergeDetectedAddress(
      { area: "Miami", addressLine: "Typed earlier", city: "Alexandria" },
      { area: null, street: null, city: null },
      untouched,
    );
    expect(next).toEqual({
      area: "Miami",
      addressLine: "Typed earlier",
      city: "Alexandria",
    });
  });

  it("refreshes a field it filled itself when the pin moves again", () => {
    const first = mergeDetectedAddress(
      empty,
      { area: "Sidi Gaber", street: "7 Ahmed Orabi St", city: "Alexandria" },
      untouched,
    );
    const second = mergeDetectedAddress(
      first,
      { area: "Miami", street: "9 Corniche Rd", city: "Alexandria" },
      untouched,
    );
    expect(second).toEqual({
      area: "Miami",
      addressLine: "9 Corniche Rd",
      city: "Alexandria",
    });
  });
});

describe("formatDetectedAddress", () => {
  it("joins the parts it has and skips the ones it does not", () => {
    expect(
      formatDetectedAddress({ area: "Sidi Gaber", street: "7 Ahmed Orabi St", city: "Alexandria" }),
    ).toBe("7 Ahmed Orabi St · Sidi Gaber · Alexandria");
    expect(formatDetectedAddress({ area: null, street: "7 Ahmed Orabi St", city: null })).toBe(
      "7 Ahmed Orabi St",
    );
  });

  it("is empty when nothing was resolved, so the hint stays hidden", () => {
    expect(formatDetectedAddress({ area: null, street: null, city: null })).toBe("");
  });
});
