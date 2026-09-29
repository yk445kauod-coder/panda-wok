/**
 * Pure helpers for the catalogue sheet importer (`scripts/import-menu-csv.mjs`).
 *
 * Kept free of any database or filesystem access so the parsing and planning
 * rules can be unit-tested directly (`tests/menu-csv.test.ts`). The script owns
 * the IO and the writes; everything decision-shaped lives here.
 */

export const slugify = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const truthy = (v) => /^(1|true|yes|y|نعم|صح)$/i.test(String(v ?? "").trim());

/** A money cell: blank stays null, otherwise a finite number (EGP, piastres ok). */
export const toMoney = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** An ordering cell: blank stays null, otherwise a non-negative integer. */
export const toSort = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

/** Minimal RFC-4180 CSV: quoted fields, embedded commas and doubled quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, ""); // strip a spreadsheet BOM

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toRecords(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("the sheet is empty");
  const header = rows[0].map(norm);
  const idx = (name) => header.indexOf(norm(name));
  const cell = (row, name) => {
    const i = idx(name);
    return i === -1 ? null : (row[i] ?? "").trim() || null;
  };

  if (idx("item_en") === -1) throw new Error('missing required column "item_en"');
  if (idx("category_en") === -1) throw new Error('missing required column "category_en"');

  return rows.slice(1).map((row, n) => ({
    line: n + 2, // 1-based, +1 for the header
    category_en: cell(row, "category_en"),
    category_ar: cell(row, "category_ar"),
    category_slug: cell(row, "category_slug"),
    item_en: cell(row, "item_en"),
    item_ar: cell(row, "item_ar"),
    description_en: cell(row, "description_en"),
    description_ar: cell(row, "description_ar"),
    price: cell(row, "price"),
    compare_at_price: cell(row, "compare_at_price"),
    item_slug: cell(row, "item_slug"),
    external_id: cell(row, "external_id"),
    image_url: cell(row, "image_url"),
    is_spicy: cell(row, "is_spicy"),
    is_featured: cell(row, "is_featured"),
    is_vegetarian: cell(row, "is_vegetarian"),
    is_vegan: cell(row, "is_vegan"),
    category_sort: cell(row, "category_sort"),
    item_sort: cell(row, "item_sort"),
  }));
}

/**
 * Groups rows into categories and validates them. Returns `{ categories, problems }`
 * where any problem must stop a write — a sheet that contradicts itself should
 * never half-apply.
 */
export function buildPlan(records) {
  const problems = [];
  const categories = new Map(); // slug -> { slug, name_en, name_ar, sort_order, items: [] }

  for (const r of records) {
    if (!r.item_en) {
      problems.push(`line ${r.line}: item_en is empty`);
      continue;
    }
    const catSlug = r.category_slug ? slugify(r.category_slug) : slugify(r.category_en ?? "");
    if (!catSlug) {
      problems.push(`line ${r.line}: no category name or slug`);
      continue;
    }
    if (!categories.has(catSlug)) {
      categories.set(catSlug, {
        slug: catSlug,
        name_en: r.category_en ?? catSlug,
        name_ar: r.category_ar,
        sort_order: toSort(r.category_sort),
        items: [],
      });
    }
    const cat = categories.get(catSlug);
    if (!cat.name_ar && r.category_ar) cat.name_ar = r.category_ar;
    if (cat.sort_order == null && r.category_sort != null) cat.sort_order = toSort(r.category_sort);

    const price = toMoney(r.price);
    if (price != null && !Number.isFinite(price)) {
      problems.push(`line ${r.line}: bad price "${r.price}"`);
      continue;
    }
    if (price != null && price < 0) {
      problems.push(`line ${r.line}: price cannot be negative ("${r.price}")`);
      continue;
    }
    const compareAt = toMoney(r.compare_at_price);
    if (compareAt != null && !Number.isFinite(compareAt)) {
      problems.push(`line ${r.line}: bad compare_at_price "${r.compare_at_price}"`);
      continue;
    }
    if (compareAt != null && price != null && compareAt < price) {
      problems.push(
        `line ${r.line}: compare_at_price ${compareAt} is below the selling price ${price}`,
      );
      continue;
    }

    cat.items.push({
      line: r.line,
      slug: r.item_slug ? slugify(r.item_slug) : slugify(r.item_en),
      external_id: r.external_id,
      name_en: r.item_en,
      name_ar: r.item_ar,
      description_en: r.description_en,
      description_ar: r.description_ar,
      price,
      compare_at_price: compareAt,
      image_url: r.image_url,
      is_spicy: truthy(r.is_spicy),
      is_featured: truthy(r.is_featured),
      is_vegetarian: truthy(r.is_vegetarian),
      is_vegan: truthy(r.is_vegan),
      sort_order: toSort(r.item_sort),
    });
  }

  // Duplicate keys inside the sheet would make the outcome order-dependent.
  const seen = new Map();
  for (const cat of categories.values()) {
    for (const it of cat.items) {
      const key = it.external_id ? `ext:${it.external_id}` : `slug:${it.slug}`;
      if (seen.has(key)) {
        problems.push(`duplicate dish ${key}: line ${seen.get(key)} and line ${it.line} — keep one`);
      }
      seen.set(key, it.line);
    }
  }
  return { categories, problems };
}

/**
 * Compares the sheet against live rows and returns what would change. Pure, so
 * the dry run and the apply pass share exactly one definition of "changed".
 * Only fields the sheet supplied are compared — a price-only sheet must not
 * report a blank description as a change.
 */
export function diffPlan({ categories, liveCats, liveItems }) {
  const catBySlug = new Map(liveCats.map((c) => [c.slug, c]));
  const itemBySlug = new Map(liveItems.map((i) => [i.slug, i]));
  const itemByExt = new Map(
    liveItems.filter((i) => i.external_id).map((i) => [i.external_id, i]),
  );

  const newCats = [];
  const updates = [];
  const creates = [];
  const unchanged = [];

  for (const cat of categories.values()) {
    const liveCat = catBySlug.get(cat.slug);
    if (!liveCat) newCats.push(cat);
    for (const it of cat.items) {
      const match = it.external_id ? itemByExt.get(it.external_id) : itemBySlug.get(it.slug);
      if (!match) {
        creates.push({ cat, item: it });
        continue;
      }
      const changes = [];
      if (it.price != null && Number(match.price) !== it.price) {
        changes.push(`price ${match.price} -> ${it.price}`);
      }
      if (
        it.compare_at_price != null &&
        toMoney(match.compare_at_price) !== it.compare_at_price
      ) {
        changes.push("compare_at_price updated");
      }
      if (it.name_en && it.name_en !== match.name_en) {
        changes.push(`name_en "${match.name_en}" -> "${it.name_en}"`);
      }
      if (it.name_ar && it.name_ar !== match.name_ar) changes.push("name_ar updated");
      if (it.description_en && it.description_en !== match.description_en) {
        changes.push("description_en updated");
      }
      if (it.description_ar && it.description_ar !== match.description_ar) {
        changes.push("description_ar updated");
      }
      if (it.image_url && it.image_url !== match.image_url) changes.push("image_url updated");
      if (it.is_spicy && it.is_spicy !== match.is_spicy) changes.push("is_spicy -> true");
      if (it.is_featured && it.is_featured !== match.is_featured) {
        changes.push("is_featured -> true");
      }
      if (it.is_vegetarian && it.is_vegetarian !== match.is_vegetarian) {
        changes.push("is_vegetarian -> true");
      }
      if (it.is_vegan && it.is_vegan !== match.is_vegan) changes.push("is_vegan -> true");
      if (it.sort_order != null && it.sort_order !== match.sort_order) {
        changes.push(`sort_order ${match.sort_order} -> ${it.sort_order}`);
      }
      if (liveCat && match.category_id !== liveCat.id) changes.push("moved category");
      if (changes.length) updates.push({ match, cat, item: it, changes });
      else unchanged.push({ match, item: it });
    }
  }

  return { newCats, creates, updates, unchanged };
}
