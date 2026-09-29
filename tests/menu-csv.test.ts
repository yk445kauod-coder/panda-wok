import { describe, expect, it } from "vitest";

import { buildPlan, diffPlan, parseCsv, slugify, toRecords, truthy } from "../scripts/lib/menu-csv.mjs";

const HEADER =
  "category_en,category_ar,category_slug,item_en,item_ar,description_en,description_ar,price,item_slug,external_id,image_url,is_spicy";

describe("parseCsv", () => {
  it("handles quoted fields, embedded commas and doubled quotes", () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });

  it("strips a spreadsheet BOM and drops blank rows", () => {
    const rows = parseCsv("\uFEFFa,b\n\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("slugify / truthy", () => {
  it("slugifies Arabic-safe ASCII and trims punctuation", () => {
    expect(slugify("Fried potato & vegetables samosa (4 pieces)")).toBe(
      "fried-potato-vegetables-samosa-4-pieces",
    );
  });

  it("accepts English and Arabic truthy spellings only", () => {
    for (const v of ["1", "true", "YES", "y", "نعم", "صح"]) expect(truthy(v)).toBe(true);
    for (const v of ["", "0", "no", "n", "خضار"]) expect(truthy(v)).toBe(false);
  });
});

describe("toRecords", () => {
  it("requires item_en and category_en", () => {
    expect(() => toRecords("category_en,foo\nAppetizers,x")).toThrow(/item_en/);
    expect(() => toRecords("item_en,foo\nDish,x")).toThrow(/category_en/);
  });

  it("maps columns case- and separator-insensitively", () => {
    const [r] = toRecords("Item_EN,CATEGORY_en,Price\nSpring rolls,Appetizers,95");
    expect(r.item_en).toBe("Spring rolls");
    expect(r.category_en).toBe("Appetizers");
    expect(r.price).toBe("95");
  });
});

describe("buildPlan", () => {
  it("groups rows into categories and auto-slugs dishes", () => {
    const { categories, problems } = buildPlan(
      toRecords(`${HEADER}\nAppetizers,المقبلات,,Spring rolls,,, ,95,,,,\nAppetizers,المقبلات,,Samosa,,,,100,,,,`),
    );
    expect(problems).toEqual([]);
    expect([...categories.keys()]).toEqual(["appetizers"]);
    expect(
      categories.get("appetizers").items.map((i: { slug: string }) => i.slug),
    ).toEqual(["spring-rolls", "samosa"]);
    expect(categories.get("appetizers").name_ar).toBe("المقبلات");
  });

  it("rejects a non-numeric or negative price", () => {
    expect(buildPlan(toRecords(`${HEADER}\nAppetizers,,,Dish,,,,abc,,,,`)).problems.join(" ")).toMatch(
      /bad price/,
    );
    expect(buildPlan(toRecords(`${HEADER}\nAppetizers,,,Dish,,,,-5,,,,,`)).problems.join(" ")).toMatch(
      /cannot be negative/,
    );
  });

  it("rejects a compare_at_price below the selling price", () => {
    const cols = HEADER.split(",").concat(["compare_at_price"]);
    const row = cols.map((c) => {
      if (c === "category_en") return "Appetizers";
      if (c === "item_en") return "Dish";
      if (c === "price") return "100";
      if (c === "compare_at_price") return "-1";
      return "";
    });
    const { problems } = buildPlan(toRecords(`${cols.join(",")}\n${row.join(",")}`));
    expect(problems.join(" ")).toMatch(/compare_at_price/);
  });

  it("carries the new flags and ordering columns through", () => {
    const cols = HEADER.split(",").concat([
      "compare_at_price",
      "is_featured",
      "is_vegetarian",
      "is_vegan",
      "category_sort",
      "item_sort",
    ]);
    const row = cols.map((c) => {
      switch (c) {
        case "category_en":
          return "Appetizers";
        case "category_ar":
          return "المقبلات";
        case "item_en":
          return "Dish";
        case "price":
          return "90";
        case "compare_at_price":
          return "120";
        case "is_featured":
        case "is_vegetarian":
          return "1";
        case "category_sort":
          return "2";
        case "item_sort":
          return "5";
        default:
          return "";
      }
    });
    const { categories } = buildPlan(toRecords(`${cols.join(",")}\n${row.join(",")}`));
    const item = categories.get("appetizers").items[0];
    expect(item.compare_at_price).toBe(120);
    expect(item.is_featured).toBe(true);
    expect(item.is_vegetarian).toBe(true);
    expect(item.is_vegan).toBe(false);
    expect(item.sort_order).toBe(5);
    expect(categories.get("appetizers").sort_order).toBe(2);
  });

  it("flags two rows that resolve to the same key", () => {
    const { problems } = buildPlan(
      toRecords(`${HEADER}\nAppetizers,,,Spring rolls,,,,95,,,,\nAppetizers,,,Spring rolls,,,,99,,,,`),
    );
    expect(problems.join(" ")).toMatch(/duplicate dish/);
  });

  it("distinguishes two same-named dishes in different categories by external_id", () => {
    const { problems } = buildPlan(
      toRecords(
        `${HEADER}\nRaw,,,Combo,,,,100,,m1,,\nFried,,,Combo,,,,120,,m2,,`,
      ),
    );
    expect(problems).toEqual([]);
  });
});

describe("diffPlan", () => {
  const liveCats = [{ id: "cat-app", slug: "appetizers", sort_order: 0 }];
  const liveItems = [
    {
      id: "it-1",
      slug: "spring-rolls",
      external_id: null,
      name_en: "Spring rolls",
      name_ar: "اسبرنج رولز",
      description_en: "Crispy rolls",
      description_ar: null,
      price: 95,
      image_url: null,
      is_spicy: false,
      category_id: "cat-app",
    },
  ];

  it("treats a matching row with identical fields as unchanged", () => {
    const { categories } = buildPlan(
      toRecords(`${HEADER}\nAppetizers,,,Spring rolls,,,,95,,,,\n`),
    );
    const d = diffPlan({ categories, liveCats, liveItems });
    expect(d.unchanged).toHaveLength(1);
    expect(d.updates).toHaveLength(0);
    expect(d.creates).toHaveLength(0);
  });

  it("reports a price change and the previous value", () => {
    const { categories } = buildPlan(toRecords(`${HEADER}\nAppetizers,,,Spring rolls,,,,105,,,,`));
    const d = diffPlan({ categories, liveCats, liveItems });
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].changes).toContain("price 95 -> 105");
  });

  it("does not report blank sheet fields as changes (price-only sheet stays safe)", () => {
    const { categories } = buildPlan(toRecords(`${HEADER}\nAppetizers,,,Spring rolls,,,,95,,,,`));
    const d = diffPlan({ categories, liveCats, liveItems });
    expect(d.unchanged).toHaveLength(1);
    expect(d.updates).toHaveLength(0);
  });

  it("matches a Japanese-style dish by external_id, not by slug collision", () => {
    const withExt = [
      { ...liveItems[0], id: "it-jp", slug: "combo", external_id: "m1" },
    ];
    const { categories } = buildPlan(
      toRecords(`${HEADER}\nRaw,,,Combo,,,,100,,m1,,\n`),
    );
    const d = diffPlan({ categories, liveCats, liveItems: withExt });
    // Matched (not created); the differing name/price surface as an update.
    expect(d.creates).toHaveLength(0);
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].changes).toContain("price 95 -> 100");
  });

  it("plans a new category and its dishes", () => {
    const { categories } = buildPlan(
      toRecords(`${HEADER}\nNoodles,,noodles,Lo-mein,,,,125,,,,\n`),
    );
    const d = diffPlan({ categories, liveCats, liveItems });
    expect(d.newCats.map((c) => c.slug)).toEqual(["noodles"]);
    expect(d.creates.map((c) => c.item.slug)).toEqual(["lo-mein"]);
    expect(d.unchanged).toHaveLength(0);
  });
});
