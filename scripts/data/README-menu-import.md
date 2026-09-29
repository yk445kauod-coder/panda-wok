# Panda Wok menu sheet

> **⛔ Do not touch the live menu database.** Running `menu:import:apply` writes
> menu rows, so it needs the owner's explicit, written request for that exact
> change. Do not run it to "refresh" or "sync" the menu, and never delete a dish
> with it. The only normal write path is the owner editing one dish at a time in
> `/admin`. See `docs/data-safety.md`.

One row per dish. You edit this in Excel/Sheets, then run the importer.

## Round trip (the safe way)

```bash
npm run menu:export          # writes scripts/data/menu-export.csv from the LIVE menu
# edit that file (prices, names, descriptions, images...) - keep the header row
cp scripts/data/menu-export.csv scripts/data/menu-import.csv
npm run menu:import          # dry run: prints exactly what would change
npm run menu:import:apply    # writes the changes
```

`menu:export` is read-only. It writes the current catalogue, including the
description and image URL of every dish, so an export -> import round trip is a
**no-op** (verified: 84 dishes, 0 changes) unless you actually edit a cell.

## Columns

| column | meaning |
| --- | --- |
| `category_en` / `category_ar` | section name; a new section is created |
| `category_slug` | stable key for the section (auto from the name if blank) |
| `item_en` | dish name - **required** |
| `item_ar` | dish name in Arabic |
| `description_en` / `description_ar` | the line shown under the dish |
| `price` | EGP, required for a new dish; piastres allowed (e.g. `95.5`) |
| `compare_at_price` | optional "was" price; must be >= `price` |
| `item_slug` / `external_id` | match keys; an existing dish is found by `external_id` first, else `item_slug` |
| `image_url` | a public image URL (e.g. the Supabase `menu-images` bucket) |
| `is_spicy` / `is_featured` / `is_vegetarian` / `is_vegan` | `1` / `true` / `نعم` to set; blank leaves it alone |
| `category_sort` / `item_sort` | ordering; lower comes first |

## Rules the importer enforces

- A **new** dish must have a price. A bad or negative price stops the whole run.
- `compare_at_price` below the selling price stops the run.
- Two rows resolving to the same dish are rejected (no order-dependent result).
- Only the fields your sheet actually fills are compared and written, so a
  price-only sheet can never blank a description.
- Nothing is deleted. A dish or section absent from the sheet is left untouched.
- If a write fails midway, sections created in that run are rolled back.

Never edit the live menu by hand in the database - the sheet is the source of
truth for the rows it lists, and the Admin CMS remains the source for everything
else.

