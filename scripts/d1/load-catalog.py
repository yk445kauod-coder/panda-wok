#!/usr/bin/env python3
"""Load the real catalogue from the KV backup dump into D1.

Source: scripts/seed/catalog-backup.json — a dump of the public-read KV keys the
storefront was serving from before Supabase restricted the project. It holds the
real rows: 19 categories, 90 dishes with their UUIDs and prices, the restaurant,
settings, feature flags, announcements, delivery zones and FAQs. It is the only
copy of the menu that is still reachable, so this is the menu migration.

Emits SQL on stdout; pipe it into `wrangler d1 execute --file`. Every statement
is an upsert, so re-running is safe and never duplicates.

    python3 scripts/d1/load-catalog.py > /tmp/catalog.sql
    wrangler d1 execute panda-wok --remote --file=/tmp/catalog.sql
"""

import json
import sys

SEED = "scripts/seed/catalog-backup.json"


def lit(value):
    """A SQL literal. None is NULL; bool is 0/1; dict/list is JSON text."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, (dict, list)):
        return lit(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    return "'%s'" % str(value).replace("'", "''")


def upsert(table, row, conflict):
    cols = list(row.keys())
    names = ", ".join('"%s"' % c for c in cols)
    values = ", ".join(lit(row[c]) for c in cols)
    updates = ", ".join('"%s" = excluded."%s"' % (c, c) for c in cols if c not in conflict)
    sql = 'INSERT INTO "%s" (%s) VALUES (%s) ON CONFLICT(%s) DO UPDATE SET %s;' % (
        table, names, values, ", ".join('"%s"' % c for c in conflict), updates,
    )
    return sql


def main():
    raw = json.load(open(SEED))

    def key(name):
        entry = raw.get(name)
        return entry["value"] if isinstance(entry, dict) and "value" in entry else entry

    out = ["-- Real catalogue loaded from the KV backup dump.",
           "-- Source: scripts/seed/catalog-backup.json (the last reachable copy of the menu).",
           ""]

    menu = key("public-menu") or {}
    categories = menu.get("categories") or []
    items = menu.get("items") or []

    # The restaurant row: several public keys carry slices of it.
    restaurant = key("public-restaurant") or {}
    if restaurant:
        row = {k: v for k, v in restaurant.items() if k in {
            "id", "slug", "name_en", "name_ar", "tagline_en", "tagline_ar", "description_en",
            "description_ar", "story_md", "cuisine_tags", "city", "area", "country", "latitude",
            "longitude", "phone", "whatsapp", "email", "social", "opening_hours", "currency", "is_active",
        }}
        row.setdefault("id", "b54b2620-90c5-4295-b617-bc1389db3ee9")
        row.setdefault("slug", "panda-wok")
        row.setdefault("name_en", "Panda Wok")
        out.append(upsert("restaurants", row, ["id"]))
        out.append("")

    for cat in categories:
        row = {k: v for k, v in cat.items() if k in {
            "id", "name_en", "name_ar", "name_ja", "slug", "description_en", "description_ar",
            "image_url", "seo_title", "seo_description", "sort_order", "is_enabled", "restaurant_id",
        }}
        row.setdefault("restaurant_id", restaurant.get("id", "b54b2620-90c5-4295-b617-bc1389db3ee9"))
        out.append(upsert("categories", row, ["id"]))

    out.append("")
    for item in items:
        row = {k: v for k, v in item.items() if k in {
            "id", "category_id", "name_en", "name_ar", "name_ja", "slug", "description_en",
            "description_ar", "price", "compare_at_price", "is_available", "is_featured", "is_spicy",
            "is_vegetarian", "is_vegan", "contains_nuts", "prep_minutes", "calories", "allergens",
            "ingredients", "image_url", "image_alt", "has_transparent_png", "sort_order", "seo_title",
            "seo_description", "seo_keywords", "is_archived", "availability_mode", "restaurant_id",
            "external_id",
        }}
        row.setdefault("restaurant_id", restaurant.get("id", "b54b2620-90c5-4295-b617-bc1389db3ee9"))
        out.append(upsert("menu_items", row, ["id"]))

    # SQLite cannot express the `current_restaurant_id()` default, so rows whose
    # table needs it get the single restaurant explicitly.
    rid = restaurant.get("id", "b54b2620-90c5-4295-b617-bc1389db3ee9")

    # Settings, flags, and the content tables the storefront reads.
    settings = key("public-settings") or {}
    for name, value in settings.items():
        out.append(upsert("settings", {"key": name, "value": value, "is_public": True}, ["key"]))

    flags = key("public-feature-flags") or []
    if isinstance(flags, dict):
        flags = [dict(v, key=k) if isinstance(v, dict) else {"key": k, "is_enabled": v}
                 for k, v in flags.items()]
    for flag in flags:
        row = {k: v for k, v in flag.items() if k in {"key", "label", "description", "module", "is_enabled", "sort_order"}}
        if "key" in row:
            out.append(upsert("feature_flags", row, ["key"]))

    for locale in ("en", "ar"):
        for faq in (key('public-faqs:["%s"]' % locale) or []):
            row = {k: v for k, v in faq.items() if k in {"id", "locale", "question", "answer", "sort_order", "is_published"}}
            row.setdefault("locale", locale)
            row.setdefault("restaurant_id", rid)
            if "id" in row:
                out.append(upsert("faqs", row, ["id"]))
        for ann in (key('public-announcements:["%s"]' % locale) or []):
            row = {k: v for k, v in ann.items() if k in {"id", "locale", "message", "href", "tone", "starts_at", "ends_at", "is_active", "sort_order"}}
            row.setdefault("locale", locale)
            row.setdefault("restaurant_id", rid)
            if "id" in row:
                out.append(upsert("announcements", row, ["id"]))

    for zone in (key("public-delivery-zones") or []):
        row = {k: v for k, v in zone.items() if k in {
            "id", "name_en", "name_ar", "areas", "fee", "free_over", "eta_minutes", "is_active", "sort_order",
        }}
        row.setdefault("restaurant_id", rid)
        if "id" in row:
            out.append(upsert("delivery_zones", row, ["id"]))

    ratings = key("public-menu-ratings") or {}
    if isinstance(ratings, dict):
        for item_id, rating in ratings.items():
            if isinstance(rating, dict):
                out.append(upsert("menu_item_ratings", {
                    "menu_item_id": item_id,
                    "average_rating": rating.get("average_rating") or rating.get("average"),
                    "rating_count": rating.get("rating_count") or rating.get("count"),
                }, ["menu_item_id"]))

    sys.stdout.write("\n".join(out) + "\n")
    sys.stderr.write("categories=%d items=%d statements=%d\n" % (len(categories), len(items), len(out)))


if __name__ == "__main__":
    main()
