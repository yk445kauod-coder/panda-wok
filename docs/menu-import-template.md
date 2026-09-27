# Menu import template (Chinese range)

Fill this in and the rows can be loaded straight into the CMS.
Nothing here is invented: every value must come from you.

## Columns

| column | required | notes |
|---|---|---|
| `category_en` | yes | Category the dish belongs to. A new name creates the category. |
| `category_ar` | yes | Arabic category name. |
| `name_en` | yes | English dish name. |
| `name_ar` | yes | Arabic dish name. |
| `price` | yes | Number only. EGP, decimals allowed (`125` or `125.50`). |
| `description_en` | no | Leave blank to publish with no description. |
| `description_ar` | no | Same. |
| `is_spicy` | no | `yes` / `no` |
| `is_vegetarian` | no | `yes` / `no` |
| `is_vegan` | no | `yes` / `no` |
| `contains_nuts` | no | `yes` / `no` |
| `calories` | no | Number only. |
| `image_url` | no | Public image URL, or upload later in the CMS. |
| `sort_order` | no | Display order within its category. `10`, `20`, `30`… |

## Rules the CMS enforces

- `price` must be a number; the tax and delivery settings apply on top at
  checkout, so enter the menu price itself.
- A category's Arabic name is shown to Arabic readers; English elsewhere.
- If two dishes would produce the same web address, the second one needs an
  explicit slug — the loader will report the clash rather than guessing.

## Data safety (read before loading anything)

This template is for **adding** a menu, not refreshing one. `scripts/import-menu.mjs`
is **insert-only** — it is not an upsert, has no `external_id` key to conflict on,
and re-running it duplicates the whole catalogue (another full set of categories
and items). A dry run reporting "no problems" does **not** mean a re-run is safe.

Never delete a dish, category or modifier to "replace" it — disable it
(`is_enabled = false`, `is_available = false`) so it can be brought back without
re-entering prices, translations or images. See `docs/data-safety.md`.

## Example (this is a format example, not a suggested menu)

```csv
category_en,category_ar,name_en,name_ar,price,description_en,description_ar,is_spicy,is_vegetarian,is_vegan,contains_nuts,calories,image_url,sort_order
Wok,الووك,Beef in Black Pepper Sauce,لحم بصوص الفلفل الأسود,240,,,no,no,no,no,,,10
Wok,الووك,Chicken Sweet & Sour,دجاج حلو وحامض,210,,,no,no,no,no,,,20
Dim Sum,ديم سم,Steamed Shrimp Dumplings,زلابية الجمبري على البخار,180,,,no,no,no,no,,,10
```
