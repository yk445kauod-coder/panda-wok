/**
 * Panda Wok catalogue importer (CSV / pasted sheet).
 *
 * The admin CMS edits one dish at a time, and `scripts/import-menu.mjs` is
 * insert-only and refuses to run once the table is populated. This script is the
 * supported way to load or update a *whole* menu from a sheet the owner keeps.
 *
 * Parsing and planning live in `scripts/lib/menu-csv.mjs` (pure, unit-tested).
 * This file owns the database IO and nothing else.
 *
 * It matches on natural keys, so it is safe to run repeatedly:
 *   - categories  -> unique `slug`
 *   - menu_items  -> `external_id` when the row supplies one, else `slug`
 *
 * Nothing is hidden and nothing is deleted. A price or name in the sheet is an
 * update; a row absent from the sheet is left exactly as it is. Only fields the
 * sheet actually provides are written, so a price-only sheet cannot blank a
 * description. Categories and dishes not in the sheet are never touched.
 *
 *   node scripts/import-menu-csv.mjs                 # dry run, prints the diff
 *   node scripts/import-menu-csv.mjs --apply         # writes the changes
 *   node scripts/import-menu-csv.mjs --export        # dump the LIVE menu to a sheet
 *   node scripts/import-menu-csv.mjs --file my.csv   # default: scripts/data/menu-import.csv
 *
 * The sheet is a flat item list, one row per dish. Columns (header row required,
 * order free, names case-insensitive):
 *
 *   category_en   category_ar   category_slug   : section; created if new
 *   item_en       item_ar                        : dish name (item_en required)
 *   description_en description_ar               : optional
 *   price         compare_at_price              : EGP, price required for a new dish
 *   item_slug     external_id                    : match keys; auto from item_en
 *   image_url                                    : public image URL
 *   is_spicy is_featured is_vegetarian is_vegan : true/1/yes
 *   category_sort item_sort                      : ordering, lower first
 *
 *   `--export` writes the live catalogue (including descriptions and images) to
 *   scripts/data/menu-export.csv. Re-importing an unchanged export is a no-op,
 *   so the round trip is: export, edit a few cells, dry run, apply.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { buildPlan, diffPlan, toRecords } from "./lib/menu-csv.mjs";

const APPLY = process.argv.includes("--apply");
const EXPORT = process.argv.includes("--export");
const fileArgIndex = process.argv.indexOf("--file");
const explicitFile = fileArgIndex !== -1 ? process.argv[fileArgIndex + 1] : null;
const DEFAULT_FILE = path.join("scripts", "data", "menu-import.csv");
const EXAMPLE_FILE = path.join("scripts", "data", "menu-import.example.csv");

// With no explicit file, prefer the owner's sheet; fall back to the committed
// example so a first run works out of the box.
const FILE = explicitFile ?? (fs.existsSync(DEFAULT_FILE) ? DEFAULT_FILE : EXAMPLE_FILE);
if (!explicitFile && FILE === EXAMPLE_FILE && !EXPORT) {
  console.log("No scripts/data/menu-import.csv yet — using the example sheet.\n");
}

/** Quote a CSV cell only when it needs it (RFC-4180). */
const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

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

const env = readEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ITEM_COLUMNS =
  "id, slug, external_id, name_en, name_ar, description_en, description_ar, price, compare_at_price, image_url, is_spicy, is_featured, is_vegetarian, is_vegan, sort_order, category_id";

const { data: liveCats, error: catErr } = await db
  .from("categories")
  .select("id, slug, name_en, name_ar, sort_order")
  .order("sort_order", { ascending: true });
if (catErr) throw new Error(`reading categories: ${catErr.message}`);

/**
 * `--export` writes the live catalogue back out as an importable sheet. This is
 * the round trip the owner edits: export, change prices or names in Excel, then
 * run the normal dry-run/apply. It never writes to the database.
 */
if (EXPORT) {
  const { data: items, error } = await db
    .from("menu_items")
    .select(ITEM_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`reading menu items: ${error.message}`);

  const catById = new Map(liveCats.map((c) => [c.id, c]));
  const columns = [
    "category_en",
    "category_ar",
    "category_slug",
    "item_en",
    "item_ar",
    "description_en",
    "description_ar",
    "price",
    "compare_at_price",
    "item_slug",
    "external_id",
    "image_url",
    "is_spicy",
    "is_featured",
    "is_vegetarian",
    "is_vegan",
    "category_sort",
    "item_sort",
  ];
  const sorted = items
    .map((i) => ({ i, c: catById.get(i.category_id) }))
    .sort((a, b) => a.c.sort_order - b.c.sort_order || a.i.sort_order - b.i.sort_order);
  const lines = [columns.join(",")];
  for (const { i, c } of sorted) {
    lines.push(
      [
        c.name_en,
        c.name_ar,
        c.slug,
        i.name_en,
        i.name_ar,
        i.description_en,
        i.description_ar,
        i.price,
        i.compare_at_price,
        i.slug,
        i.external_id,
        i.image_url,
        i.is_spicy ? "1" : "",
        i.is_featured ? "1" : "",
        i.is_vegetarian ? "1" : "",
        i.is_vegan ? "1" : "",
        c.sort_order,
        i.sort_order,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const outFile = explicitFile ?? path.join("scripts", "data", "menu-export.csv");
  fs.writeFileSync(outFile, `${lines.join("\n")}\n`);
  console.log(`Exported ${sorted.length} dishes across ${liveCats.length} categories to ${outFile}`);
  process.exit(0);
}

if (!fs.existsSync(FILE)) {
  console.error(`Sheet not found: ${FILE}`);
  console.error("Create it from the format described at the top of this script.");
  process.exit(1);
}

const { categories, problems } = buildPlan(toRecords(fs.readFileSync(FILE, "utf8")));

const { data: liveItems, error: itemErr } = await db.from("menu_items").select(ITEM_COLUMNS);
if (itemErr) throw new Error(`reading menu items: ${itemErr.message}`);

const { newCats, creates, updates, unchanged } = diffPlan({
  categories,
  liveCats,
  liveItems,
});

console.log(`Sheet: ${FILE}`);
console.log("\n=== PLAN ===");
console.log(`new categories:  ${newCats.length}`);
for (const c of newCats) console.log(`   + ${c.slug}  ${c.name_en} (${c.items.length} items)`);
console.log(`new dishes:      ${creates.length}`);
for (const c of creates) console.log(`   + ${c.item.slug}  ${c.item.price ?? "NO PRICE"}`);
console.log(`price/field updates: ${updates.length}`);
for (const u of updates) console.log(`   ~ ${u.item.slug}: ${u.changes.join("; ")}`);
console.log(`unchanged:       ${unchanged.length}`);

for (const c of creates.filter((c) => c.item.price == null)) {
  problems.push(`new dish "${c.item.slug}" has no price`);
}

console.log("\n=== PROBLEMS ===");
console.log(problems.length ? problems.join("\n") : "(none)");

if (problems.length) {
  console.log("\nRefusing to write while problems remain.");
  process.exit(1);
}
if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply to import.");
  process.exit(0);
}
if (newCats.length + creates.length + updates.length === 0) {
  console.log("\nNothing to do.");
  process.exit(0);
}

// ------------------------------------------------------------------ apply

const createdCategoryIds = [];
try {
  const catIdBySlug = new Map(liveCats.map((c) => [c.slug, c]));
  let sortOrder = liveCats.length ? Math.max(...liveCats.map((c) => c.sort_order)) + 1 : 0;

  for (const cat of newCats) {
    const { data, error } = await db
      .from("categories")
      .insert({
        name_en: cat.name_en,
        name_ar: cat.name_ar,
        slug: cat.slug,
        sort_order: cat.sort_order ?? sortOrder++,
        is_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`category ${cat.slug}: ${error.message}`);
    createdCategoryIds.push(data.id);
    catIdBySlug.set(cat.slug, { id: data.id, slug: cat.slug });
    console.log(`+ category ${cat.slug}`);
  }

  let itemOrder = 0;
  for (const { cat, item } of creates) {
    const { error } = await db.from("menu_items").insert({
      category_id: catIdBySlug.get(cat.slug).id,
      name_en: item.name_en,
      name_ar: item.name_ar,
      slug: item.slug,
      external_id: item.external_id,
      description_en: item.description_en,
      description_ar: item.description_ar,
      price: item.price,
      compare_at_price: item.compare_at_price,
      image_url: item.image_url,
      is_spicy: item.is_spicy,
      is_featured: item.is_featured,
      is_vegetarian: item.is_vegetarian,
      is_vegan: item.is_vegan,
      is_available: true,
      sort_order: item.sort_order ?? itemOrder++,
    });
    if (error) throw new Error(`dish ${item.slug}: ${error.message}`);
    console.log(`+ dish ${item.slug} @ ${item.price}`);
  }

  for (const u of updates) {
    const patch = {};
    if (u.item.price != null) patch.price = u.item.price;
    if (u.item.compare_at_price != null) patch.compare_at_price = u.item.compare_at_price;
    if (u.item.name_en) patch.name_en = u.item.name_en;
    if (u.item.name_ar) patch.name_ar = u.item.name_ar;
    if (u.item.description_en) patch.description_en = u.item.description_en;
    if (u.item.description_ar) patch.description_ar = u.item.description_ar;
    if (u.item.image_url) patch.image_url = u.item.image_url;
    if (u.item.is_spicy) patch.is_spicy = true;
    if (u.item.is_featured) patch.is_featured = true;
    if (u.item.is_vegetarian) patch.is_vegetarian = true;
    if (u.item.is_vegan) patch.is_vegan = true;
    if (u.item.sort_order != null) patch.sort_order = u.item.sort_order;
    const targetCat = catIdBySlug.get(u.cat.slug);
    if (targetCat && u.match.category_id !== targetCat.id) patch.category_id = targetCat.id;

    const { error } = await db.from("menu_items").update(patch).eq("id", u.match.id);
    if (error) throw new Error(`dish ${u.item.slug}: ${error.message}`);
    console.log(`~ dish ${u.item.slug}: ${u.changes.join("; ")}`);
  }
} catch (error) {
  console.error(`\nImport failed: ${error.message}`);
  if (createdCategoryIds.length) {
    console.error("Rolling back categories created in this run...");
    const rollback = await db.from("categories").delete().in("id", createdCategoryIds);
    console.error(rollback.error ? `rollback failed: ${rollback.error.message}` : "rollback complete");
  }
  process.exit(1);
}

console.log("\nImport complete. The sheet is now the state of the menu for the rows it lists.");
console.log("Dishes and categories not in the sheet were left untouched.");
