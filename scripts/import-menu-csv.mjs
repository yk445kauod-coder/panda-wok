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
 *   node scripts/import-menu-csv.mjs --file my.csv   # default: scripts/data/menu-import.csv
 *
 * The sheet is a flat item list, one row per dish. Columns (header row required,
 * order free, names case-insensitive):
 *
 *   category_en   category_ar   category_slug   : section; created if new
 *   item_en       item_ar                        : dish name (item_en required)
 *   description_en description_ar               : optional
 *   price                                        : EGP, required for a new dish
 *   item_slug     external_id                    : match keys; auto from item_en
 *   image_url     is_spicy                       : optional (is_spicy: true/1/yes)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { buildPlan, diffPlan, toRecords } from "./lib/menu-csv.mjs";

const APPLY = process.argv.includes("--apply");
const fileArgIndex = process.argv.indexOf("--file");
const explicitFile = fileArgIndex !== -1 ? process.argv[fileArgIndex + 1] : null;
const DEFAULT_FILE = path.join("scripts", "data", "menu-import.csv");
const EXAMPLE_FILE = path.join("scripts", "data", "menu-import.example.csv");

// With no explicit file, prefer the owner's sheet; fall back to the committed
// example so a first run works out of the box.
const FILE = explicitFile ?? (fs.existsSync(DEFAULT_FILE) ? DEFAULT_FILE : EXAMPLE_FILE);
if (!explicitFile && FILE === EXAMPLE_FILE) {
  console.log("No scripts/data/menu-import.csv yet — using the example sheet.\n");
}

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

if (!fs.existsSync(FILE)) {
  console.error(`Sheet not found: ${FILE}`);
  console.error("Create it from the format described at the top of this script.");
  process.exit(1);
}

const { categories, problems } = buildPlan(toRecords(fs.readFileSync(FILE, "utf8")));

const env = readEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: liveCats, error: catErr } = await db
  .from("categories")
  .select("id, slug, name_en, name_ar, sort_order");
if (catErr) throw new Error(`reading categories: ${catErr.message}`);
const { data: liveItems, error: itemErr } = await db
  .from("menu_items")
  .select(
    "id, slug, external_id, name_en, name_ar, description_en, description_ar, price, image_url, is_spicy, category_id",
  );
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
        sort_order: sortOrder++,
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
      image_url: item.image_url,
      is_spicy: item.is_spicy,
      is_available: true,
      sort_order: itemOrder++,
    });
    if (error) throw new Error(`dish ${item.slug}: ${error.message}`);
    console.log(`+ dish ${item.slug} @ ${item.price}`);
  }

  for (const u of updates) {
    const patch = {};
    if (u.item.price != null) patch.price = u.item.price;
    if (u.item.name_en) patch.name_en = u.item.name_en;
    if (u.item.name_ar) patch.name_ar = u.item.name_ar;
    if (u.item.description_en) patch.description_en = u.item.description_en;
    if (u.item.description_ar) patch.description_ar = u.item.description_ar;
    if (u.item.image_url) patch.image_url = u.item.image_url;
    if (u.item.is_spicy) patch.is_spicy = true;
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
