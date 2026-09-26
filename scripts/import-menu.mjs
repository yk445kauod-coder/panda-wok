/**
 * Panda Wok menu importer.
 *
 * Source: scripts/data/panda-wok-menu.json (a CMS manifest exported from the
 * owner's spreadsheet). It is a flat list of source rows; the structure is
 * positional and has three shapes:
 *
 *   1. Standalone dish
 *        description row ("Vegetables spring rolls (4 pieces)")
 *        description row ("mixed vegetables and glass noodles served with ...")
 *        priced row ("...", 95)
 *      -> one menu_item at that price, description = the second line.
 *
 *   2. Priced variants ("your choice :")
 *        name row ("Lo-mein chinese fried noodles")
 *        description row
 *        "your choice :"
 *        priced rows (no protein 125 / chicken 208 / beef 249 / shrimp 275)
 *      -> one menu_item (base = cheapest variant) + a required modifier group
 *         whose options are the variants, priced as price_delta from the base.
 *
 *   3. Free choice ("your choice :")
 *        name row / description row / "your choice :" / unpriced option rows
 *        (steamed, fried) or trailing "your choice of ..." description lines
 *      -> one menu_item + a modifier group with price_delta 0.
 *
 * Section headers start a new category. Rows are processed strictly in source
 * order, and every row is accounted for.
 *
 *   node scripts/import-menu.mjs --dry-run   # plan + validation, writes nothing
 *   node scripts/import-menu.mjs --apply     # writes to the live database
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry-run") || !APPLY;

const SPICY_GLYPH = "\uf336"; // private-use mark in the source meaning "spicy"
const CHOICE_LABEL_RE = /your\s+choice\s*:/i;
const CHOICE_OF_RE = /^your choice of\b/i;
const PROTEIN_OPTIONS = new Set(["no protein", "chicken", "beef", "shrimp"]);

const readEnv = () => {
  const file = path.join(process.cwd(), ".env.local");
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
};

const clean = (value) => {
  if (value == null) return { text: null, spicy: false };
  const spicy = value.includes(SPICY_GLYPH);
  const text = value.replaceAll(SPICY_GLYPH, "").replace(/\s+/g, " ").trim();
  return { text: text || null, spicy };
};

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// ---------------------------------------------------------------- parse

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts/data/panda-wok-menu.json"), "utf8"),
);
const rows = [...manifest.all_source_records].sort((a, b) => a.source_row - b.source_row);
const sectionMeta = new Map(manifest.sections.map((s) => [s.source_row, s]));

const sections = [];
let section = null;
let item = null;
let mode = null; // null | "naming" | "desc" | "choice" | "variants" | "free-options" | "done"
const unmatched = [];

const startItem = (name_en, name_ar, row, nextMode) => {
  item = {
    name_en,
    name_ar,
    row,
    spicy: false,
    descLines: [],
    freeOptions: [],
    variants: [],
    basePrice: null,
  };
  section.items.push(item);
  mode = nextMode;
};

for (const row of rows) {
  if (row.record_type === "header") continue;

  if (row.record_type === "section") {
    const meta = sectionMeta.get(row.source_row);
    if (!meta) throw new Error(`no section metadata for source row ${row.source_row}`);
    section = {
      source_row: row.source_row,
      slug: meta.slug,
      name_en: meta.name_en,
      name_ar: meta.name_ar,
      items: [],
    };
    sections.push(section);
    item = null;
    mode = null;
    continue;
  }

  const en = clean(row.name_en);
  const ar = clean(row.name_ar);
  if (!en.text) continue;

  if (row.record_type === "priced_item") {
    const isProtein = PROTEIN_OPTIONS.has(en.text.toLowerCase());
    if ((mode === "choice" || mode === "variants") && item && isProtein) {
      // Priced variant of the dish above ("no protein / chicken / beef / shrimp").
      mode = "variants";
      item.variants.push({ name_en: en.text, name_ar: ar.text, price: row.price, row: row.source_row });
    } else {
      // Any other priced row starts a new dish, named by the priced row itself.
      startItem(en.text, ar.text, row.source_row, "desc");
      item.spicy = en.spicy || ar.spicy;
      item.basePrice = row.price;
    }
    continue;
  }

  // ---- non-priced lines ----
  if (CHOICE_LABEL_RE.test(en.text)) {
    mode = "choice";
    continue;
  }
  if (mode === "choice") {
    mode = PROTEIN_OPTIONS.has(en.text.toLowerCase()) ? "variants" : "free-options";
  }

  if (mode === "naming" || mode === "desc") {
    // Lines after a dish name/price describe that dish.
    item.descLines.push({ name_en: en.text, name_ar: ar.text, row: row.source_row });
    if (en.spicy) item.spicy = true;
    mode = "desc";
    continue;
  }
  if (mode === "free-options") {
    if (/^all items\b/i.test(en.text)) {
      item.descLines.push({ name_en: en.text, name_ar: ar.text, row: row.source_row });
    } else {
      item.freeOptions.push({ name_en: en.text, name_ar: ar.text, price_delta: 0, row: row.source_row });
    }
    continue;
  }
  // A new dish name after a variant block.
  startItem(en.text, ar.text, row.source_row, "naming");
  item.spicy = en.spicy || ar.spicy;
}

// ------------------------------------------------------- build the plan

const plan = [];
for (const sec of sections) {
  const items = [];
  for (const it of sec.items) {
    const variants = it.variants;
    const freeOptions = it.freeOptions;
    const basePrice = variants.length ? Math.min(...variants.map((v) => v.price)) : it.basePrice;
    if (basePrice == null) throw new Error(`item without a price: ${it.name_en} (row ${it.row})`);

    const groups = [];
    if (variants.length) {
      groups.push({
        name_en: "Choose your protein",
        name_ar: "اختر البروتين",
        min_select: 1,
        max_select: 1,
        options: variants.map((v) => ({
          name_en: v.name_en,
          name_ar: v.name_ar,
          price_delta: Number((v.price - basePrice).toFixed(2)),
          row: v.row,
        })),
      });
    }
    if (freeOptions.length) {
      const styleGroup = {
        name_en: "Choose your style",
        name_ar: "اختر النوع",
        min_select: 0,
        max_select: 1,
        options: [],
      };
      for (const o of freeOptions) {
        if (o.name_ar) {
          styleGroup.options.push({
            name_en: o.name_en,
            name_ar: o.name_ar,
            price_delta: 0,
            row: o.row,
          });
        } else {
          // A "your choice of X or Y with ..." line describes the dish rather
          // than offering a priced choice, so it belongs in the description.
          it.descLines.push({ name_en: o.name_en, name_ar: null, row: o.row });
        }
      }
      if (styleGroup.options.length) groups.push(styleGroup);
    }

    items.push({
      name_en: it.name_en,
      name_ar: it.name_ar,
      slug: slugify(it.name_en),
      price: basePrice,
      description_en: it.descLines.map((d) => d.name_en).join(" ") || null,
      description_ar: it.descLines.map((d) => d.name_ar).filter(Boolean).join(" ") || null,
      is_spicy: it.spicy,
      source_row: it.row,
      groups,
    });
  }
  plan.push({ ...sec, items });
}

// ------------------------------------------------------------ validation

const problems = [];
const seenSlugs = new Map();
let itemCount = 0;
let groupCount = 0;
let optionCount = 0;
let pricedRowsConsumed = 0;

for (const sec of plan) {
  for (const it of sec.items) {
    itemCount++;
    if (!it.slug) problems.push(`empty slug for ${it.name_en}`);
    if (seenSlugs.has(it.slug)) {
      problems.push(`duplicate slug "${it.slug}": ${seenSlugs.get(it.slug)} vs ${it.name_en}`);
    }
    seenSlugs.set(it.slug, it.name_en);
    if (it.price < 0) problems.push(`negative price for ${it.name_en}`);
    for (const g of it.groups) {
      groupCount++;
      if (g.options.length === 0) problems.push(`empty group ${g.name_en} on ${it.name_en}`);
      for (const o of g.options) {
        optionCount++;
        if (o.price_delta < 0) problems.push(`negative delta for ${o.name_en} on ${it.name_en}`);
      }
    }
  }
}

const sourcePriced = rows.filter((r) => r.record_type === "priced_item").length;
pricedRowsConsumed = plan.reduce(
  (n, s) => n + s.items.length + s.items.reduce((m, i) => m + i.groups.reduce((k, g) => k + g.options.length, 0), 0),
  0,
);

console.log("=== PLAN ===");
for (const sec of plan) {
  console.log(`\n[${sec.name_en}] / ${sec.name_ar}  slug=${sec.slug}  (source row ${sec.source_row})`);
  for (const it of sec.items) {
    const groups = it.groups.map((g) => `${g.name_en}(${g.options.length})`).join(" + ");
    console.log(
      `   ${String(it.price).padStart(5)}  ${it.name_en}${it.is_spicy ? "  SPICY" : ""}${groups ? `  [${groups}]` : ""}`,
    );
    for (const g of it.groups) {
      console.log(
        `            ${g.name_en}: ${g.options.map((o) => `${o.name_en}${o.price_delta ? ` +${o.price_delta}` : ""}`).join(", ")}`,
      );
    }
  }
}

console.log("\n=== COUNTS ===");
console.log(`categories:        ${plan.length}`);
console.log(`menu items:        ${itemCount}`);
console.log(`modifier groups:   ${groupCount}`);
console.log(`modifier options:  ${optionCount}`);
console.log(`priced source rows: ${sourcePriced}  -> items+options: ${pricedRowsConsumed}`);
console.log(`unmatched rows:    ${unmatched.length}`);
for (const u of unmatched) console.log(`   row ${u.source_row}: ${u.name_en}`);

console.log("\n=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");

console.log("\n=== AUDIT ===");
const noAr = [];
const noDesc = [];
const noArDesc = [];
for (const sec of plan) {
  for (const it of sec.items) {
    if (!it.name_ar) noAr.push(it.name_en);
    if (!it.description_en) noDesc.push(it.name_en);
    else if (!it.description_ar) noArDesc.push(it.name_en);
  }
}
console.log(`items with no Arabic name:        ${noAr.length}`);
noAr.forEach((n) => console.log(`   - ${n}`));
console.log(`items with no description:        ${noDesc.length}`);
noDesc.forEach((n) => console.log(`   - ${n}`));
console.log(`items with EN desc but no AR desc: ${noArDesc.length}`);
noArDesc.forEach((n) => console.log(`   - ${n}`));

const JAPANESE_RE = /teriyaki|teppan|japanese|ramen|korean|sushi|miso/i;
const japanese = [];
for (const sec of plan) {
  for (const it of sec.items) {
    if (JAPANESE_RE.test(it.name_en) || (it.description_en && JAPANESE_RE.test(it.description_en))) {
      japanese.push(`[${sec.name_en}] ${it.name_en} (${it.price})`);
    }
  }
}
console.log(`\nJapanese-named / Japanese-described dishes: ${japanese.length}`);
japanese.forEach((n) => console.log(`   - ${n}`));

if (problems.length || unmatched.length) {
  console.log("\nRefusing to write while problems remain.");
  process.exit(1);
}
if (DRY) {
  console.log("\nDry run only — nothing written. Re-run with --apply to import.");
  process.exit(0);
}

// --------------------------------------------------------------- import

const env = readEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const existing = await db.from("menu_items").select("id", { count: "exact", head: true });
if ((existing.count ?? 0) > 0) {
  console.error(`Refusing to import: menu_items already holds ${existing.count} rows.`);
  process.exit(1);
}

let sortOrder = 0;
const createdCategoryIds = [];
try {
  for (const sec of plan) {
    const cat = await db
      .from("categories")
      .insert({
        name_en: sec.name_en,
        name_ar: sec.name_ar,
        slug: sec.slug,
        sort_order: sortOrder++,
        is_enabled: true,
      })
      .select("id")
      .single();
    if (cat.error) throw new Error(`category ${sec.slug}: ${cat.error.message}`);
    createdCategoryIds.push(cat.data.id);

    let itemOrder = 0;
    for (const it of sec.items) {
      const inserted = await db
        .from("menu_items")
        .insert({
          category_id: cat.data.id,
          name_en: it.name_en,
          name_ar: it.name_ar,
          slug: it.slug,
          description_en: it.description_en,
          description_ar: it.description_ar,
          price: it.price,
          is_spicy: it.is_spicy,
          is_available: true,
          sort_order: itemOrder++,
        })
        .select("id")
        .single();
      if (inserted.error) throw new Error(`item ${it.slug}: ${inserted.error.message}`);

      let groupOrder = 0;
      for (const g of it.groups) {
        const group = await db
          .from("modifier_groups")
          .insert({
            menu_item_id: inserted.data.id,
            name_en: g.name_en,
            name_ar: g.name_ar,
            min_select: g.min_select,
            max_select: g.max_select,
            sort_order: groupOrder++,
          })
          .select("id")
          .single();
        if (group.error) throw new Error(`group on ${it.slug}: ${group.error.message}`);

        let optionOrder = 0;
        for (const o of g.options) {
          const option = await db.from("modifier_options").insert({
            group_id: group.data.id,
            name_en: o.name_en,
            name_ar: o.name_ar,
            price_delta: o.price_delta,
            is_available: true,
            sort_order: optionOrder++,
          });
          if (option.error) throw new Error(`option on ${it.slug}: ${option.error.message}`);
        }
      }
    }
    console.log(`imported [${sec.name_en}] — ${sec.items.length} items`);
  }
} catch (error) {
  console.error(`\nImport failed: ${error.message}`);
  console.error("Rolling back the categories created in this run...");
  const rollback = await db.from("categories").delete().in("id", createdCategoryIds);
  console.error(rollback.error ? `rollback failed: ${rollback.error.message}` : "rollback complete");
  process.exit(1);
}

console.log("\nImport complete.");
