#!/usr/bin/env python3
"""Generate the D1 (SQLite) schema from the live Postgres schema.

Type mapping, applied uniformly so the d1-compat shim treats every column the
same way regardless of what Postgres called it:

    uuid / vector / citext / text[]   -> TEXT   (arrays and jsonb stored as JSON text)
    timestamptz / date / time         -> TEXT   (ISO-8601 UTC, so ORDER BY still sorts)
    jsonb / json                      -> TEXT
    bool                              -> INTEGER 0/1
    int2 / int4 / int8                -> INTEGER
    numeric / float4 / float8         -> REAL   (float64; money keeps its 2dp)

Enums become TEXT + CHECK, because SQLite has no enum type and a CHECK is the
closest thing that still rejects a bad status.

Run:  python3 scripts/d1/generate-schema.py d1/migrations/0001_init.sql
"""

ENUMS = {
    "staff_role": ["owner", "admin", "manager", "kitchen", "support", "marketing"],
    "order_status": [
        "new", "accepted", "in_progress", "prepared",
        "out_for_delivery", "finished", "canceled", "rejected", "failed", "refunded",
    ],
    "fulfillment_type": ["delivery", "pickup"],
    "payment_method": ["cash_on_delivery", "card_on_delivery", "online", "instapay"],
    "payment_status": ["unpaid", "authorized", "paid", "refunded", "failed"],
    "feedback_category": ["food_quality", "delivery", "service", "overall", "other", "complaint", "suggestion"],
    "feedback_status": ["new", "reviewed", "responded", "resolved", "archived"],
    "conversation_status": ["open", "pending", "closed"],
    "export_format": ["csv", "json", "xlsx", "txt"],
    "export_status": ["queued", "running", "ready", "failed", "expired"],
    "backup_kind": ["database", "configuration", "menu", "media_refs", "snapshot"],
    "backup_status": ["queued", "running", "ready", "failed"],
    "offer_kind": ["percent", "fixed"],
}

TEXT = "TEXT"
INT = "INTEGER"
REAL = "REAL"

# SQLite has no user-defined functions, so Postgres' `gen_uuid()` default becomes
# a v4-UUID expression built from `randomblob`. `current_restaurant_id()` cannot
# be translated at all: SQLite forbids a subquery in a DEFAULT. The shim fills
# that column instead, which is what the Postgres default did anyway.
UUID_EXPR = (
    "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||"
    " substr(lower(hex(randomblob(2))), 2) || '-' ||"
    " substr('89ab', abs(random()) % 4 + 1, 1) ||"
    " substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))"
)
# Columns the shim must populate because SQLite cannot express the default.
SHIM_FILLED_DEFAULT = "current_restaurant_id()"

# Postgres' `now()` does not exist in SQLite; `CURRENT_TIMESTAMP` is the keyword
# that yields the same UTC second-precision string the shim expects.
DEFAULT_MAP = {"now()": "CURRENT_TIMESTAMP"}

# (table, [(column, type, notnull, default, enum_or_None)])
TABLES = [
    ("restaurants", [
        ("id", TEXT, 1, "gen_uuid()", None), ("slug", TEXT, 1, None, None), ("name_en", TEXT, 1, None, None),
        ("name_ar", TEXT, 0, None, None), ("tagline_en", TEXT, 0, None, None), ("tagline_ar", TEXT, 0, None, None),
        ("description_en", TEXT, 0, None, None), ("description_ar", TEXT, 0, None, None), ("story_md", TEXT, 0, None, None),
        ("cuisine_tags", TEXT, 1, "'[]'", None), ("city", TEXT, 0, None, None), ("area", TEXT, 0, None, None),
        ("country", TEXT, 0, "'Egypt'", None), ("latitude", REAL, 0, None, None), ("longitude", REAL, 0, None, None),
        ("phone", TEXT, 0, None, None), ("whatsapp", TEXT, 0, None, None), ("email", TEXT, 0, None, None),
        ("social", TEXT, 1, "'{}'", None), ("opening_hours", TEXT, 1, "'{}'", None), ("currency", TEXT, 1, "'EGP'", None),
        ("is_active", INT, 1, "1", None), ("created_at", TEXT, 1, "now()", None), ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("categories", [
        ("id", TEXT, 1, "gen_uuid()", None), ("name_en", TEXT, 1, None, None), ("name_ar", TEXT, 0, None, None),
        ("slug", TEXT, 1, None, None), ("description_en", TEXT, 0, None, None), ("description_ar", TEXT, 0, None, None),
        ("image_url", TEXT, 0, None, None), ("seo_title", TEXT, 0, None, None), ("seo_description", TEXT, 0, None, None),
        ("sort_order", INT, 1, "0", None), ("is_enabled", INT, 1, "1", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("name_ja", TEXT, 0, None, None),
    ]),
    ("menu_items", [
        ("id", TEXT, 1, "gen_uuid()", None), ("category_id", TEXT, 1, None, None), ("name_en", TEXT, 1, None, None),
        ("name_ar", TEXT, 0, None, None), ("slug", TEXT, 1, None, None), ("description_en", TEXT, 0, None, None),
        ("description_ar", TEXT, 0, None, None), ("price", REAL, 1, None, None), ("compare_at_price", REAL, 0, None, None),
        ("is_available", INT, 1, "1", None), ("is_featured", INT, 1, "0", None), ("is_spicy", INT, 1, "0", None),
        ("is_vegetarian", INT, 1, "0", None), ("is_vegan", INT, 1, "0", None), ("contains_nuts", INT, 1, "0", None),
        ("prep_minutes", INT, 1, "0", None), ("calories", INT, 0, None, None), ("allergens", TEXT, 1, "'[]'", None),
        ("ingredients", TEXT, 1, "'[]'", None), ("image_url", TEXT, 0, None, None), ("image_alt", TEXT, 0, None, None),
        ("has_transparent_png", INT, 1, "0", None), ("sort_order", INT, 1, "0", None), ("seo_title", TEXT, 0, None, None),
        ("seo_description", TEXT, 0, None, None), ("seo_keywords", TEXT, 1, "'[]'", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("is_archived", INT, 1, "0", None),
        ("availability_mode", TEXT, 1, "'auto'", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("name_ja", TEXT, 0, None, None), ("external_id", TEXT, 0, None, None),
    ]),
    ("modifier_groups", [
        ("id", TEXT, 1, "gen_uuid()", None), ("menu_item_id", TEXT, 1, None, None), ("name_en", TEXT, 1, None, None),
        ("name_ar", TEXT, 0, None, None), ("min_select", INT, 1, "0", None), ("max_select", INT, 1, "1", None),
        ("is_required", INT, 1, "0", None), ("sort_order", INT, 1, "0", None),
    ]),
    ("modifier_options", [
        ("id", TEXT, 1, "gen_uuid()", None), ("group_id", TEXT, 1, None, None), ("name_en", TEXT, 1, None, None),
        ("name_ar", TEXT, 0, None, None), ("price_delta", REAL, 1, "0", None), ("is_available", INT, 1, "1", None),
        ("sort_order", INT, 1, "0", None),
    ]),
    ("menu_images", [
        ("id", TEXT, 1, "gen_uuid()", None), ("menu_item_id", TEXT, 1, None, None), ("storage_path", TEXT, 0, None, None),
        ("external_url", TEXT, 0, None, None), ("alt_en", TEXT, 0, None, None), ("alt_ar", TEXT, 0, None, None),
        ("role", TEXT, 1, "'gallery'", None), ("width", INT, 0, None, None), ("height", INT, 0, None, None),
        ("format", TEXT, 0, None, None), ("bytes", INT, 0, None, None), ("sort_order", INT, 1, "0", None),
        ("created_at", TEXT, 1, "now()", None),
    ]),
    ("menu_item_ratings", [
        ("menu_item_id", TEXT, 1, None, None), ("average_rating", REAL, 0, None, None), ("rating_count", INT, 0, None, None),
    ]),
    ("settings", [
        ("key", TEXT, 1, None, None), ("value", TEXT, 1, None, None), ("description", TEXT, 0, None, None),
        ("is_public", INT, 1, "0", None), ("updated_at", TEXT, 1, "now()", None), ("updated_by", TEXT, 0, None, None),
    ]),
    ("feature_flags", [
        ("key", TEXT, 1, None, None), ("label", TEXT, 1, None, None), ("description", TEXT, 0, None, None),
        ("module", TEXT, 1, None, None), ("is_enabled", INT, 1, "1", None), ("sort_order", INT, 1, "0", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("page_content", [
        ("id", TEXT, 1, "gen_uuid()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("page_key", TEXT, 1, None, None), ("section_key", TEXT, 1, None, None), ("locale", TEXT, 1, "'en'", None),
        ("heading", TEXT, 0, None, None), ("body", TEXT, 0, None, None), ("sort_order", INT, 1, "0", None),
        ("is_published", INT, 1, "1", None), ("created_at", TEXT, 1, "now()", None), ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("page_seo", [
        ("id", TEXT, 1, "gen_uuid()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("page_key", TEXT, 1, None, None), ("locale", TEXT, 1, "'en'", None), ("title", TEXT, 0, None, None),
        ("description", TEXT, 0, None, None), ("og_image_url", TEXT, 0, None, None), ("noindex", INT, 1, "0", None),
        ("created_at", TEXT, 1, "now()", None), ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("delivery_zones", [
        ("id", TEXT, 1, "gen_uuid()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("name_en", TEXT, 1, None, None), ("name_ar", TEXT, 0, None, None), ("areas", TEXT, 1, "'[]'", None),
        ("fee", REAL, 1, "0", None), ("free_over", REAL, 0, None, None), ("eta_minutes", INT, 0, None, None),
        ("is_active", INT, 1, "1", None), ("sort_order", INT, 1, "0", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("announcements", [
        ("id", TEXT, 1, "gen_uuid()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("locale", TEXT, 1, "'en'", None), ("message", TEXT, 1, None, None), ("href", TEXT, 0, None, None),
        ("tone", TEXT, 1, "'info'", None), ("starts_at", TEXT, 0, None, None), ("ends_at", TEXT, 0, None, None),
        ("is_active", INT, 1, "1", None), ("sort_order", INT, 1, "0", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("faqs", [
        ("id", TEXT, 1, "gen_uuid()", None), ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
        ("locale", TEXT, 1, "'en'", None), ("question", TEXT, 1, None, None), ("answer", TEXT, 1, None, None),
        ("sort_order", INT, 1, "0", None), ("is_published", INT, 1, "1", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("offers", [
        ("id", TEXT, 1, "gen_uuid()", None), ("name_en", TEXT, 1, None, None), ("name_ar", TEXT, 0, None, None),
        ("kind", TEXT, 1, "'fixed'", "offer_kind"), ("threshold", REAL, 1, "0", None), ("value", REAL, 1, None, None),
        ("max_discount", REAL, 0, None, None), ("is_enabled", INT, 1, "1", None), ("sort_order", INT, 1, "0", None),
        ("restaurant_id", TEXT, 1, "current_restaurant_id()", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("customer_id", TEXT, 0, None, None),
    ]),
    ("customer_tags", [
        ("id", TEXT, 1, "gen_uuid()", None), ("key", TEXT, 1, None, None), ("label_en", TEXT, 1, None, None),
        ("label_ar", TEXT, 1, None, None), ("tone", TEXT, 1, "'neutral'", None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("customer_tag_links", [
        ("customer_id", TEXT, 1, None, None), ("tag_id", TEXT, 1, None, None), ("assigned_by", TEXT, 0, None, None),
        ("assigned_at", TEXT, 1, "now()", None),
    ]),
    ("customer_notes", [
        ("id", TEXT, 1, "gen_uuid()", None), ("customer_id", TEXT, 1, None, None), ("author_id", TEXT, 0, None, None),
        ("body", TEXT, 1, None, None), ("is_pinned", INT, 1, "0", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("profiles", [
        ("id", TEXT, 1, None, None), ("full_name", TEXT, 0, None, None), ("phone", TEXT, 0, None, None),
        ("email", TEXT, 0, None, None), ("locale", TEXT, 1, "'en'", None), ("marketing_opt_in", INT, 1, "0", None),
        ("notifications_opt_in", INT, 1, "1", None), ("is_blocked", INT, 1, "0", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("last_seen_at", TEXT, 0, None, None),
        ("restaurant_id", TEXT, 1, "current_restaurant_id()", None),
    ]),
    ("addresses", [
        ("id", TEXT, 1, "gen_uuid()", None), ("user_id", TEXT, 1, None, None), ("label", TEXT, 1, "'Home'", None),
        ("contact_name", TEXT, 0, None, None), ("contact_phone", TEXT, 0, None, None), ("address_line", TEXT, 1, None, None),
        ("building", TEXT, 0, None, None), ("floor", TEXT, 0, None, None), ("apartment", TEXT, 0, None, None),
        ("landmark", TEXT, 0, None, None), ("area", TEXT, 0, None, None), ("city", TEXT, 0, "'Alexandria'", None),
        ("notes", TEXT, 0, None, None), ("latitude", REAL, 0, None, None), ("longitude", REAL, 0, None, None),
        ("accuracy_m", REAL, 0, None, None), ("is_default", INT, 1, "0", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("staff", [
        ("user_id", TEXT, 1, None, None), ("role", TEXT, 1, "'kitchen'", "staff_role"), ("display_name", TEXT, 0, None, None),
        ("is_active", INT, 1, "1", None), ("created_at", TEXT, 1, "now()", None), ("login_id", TEXT, 0, None, None),
    ]),
    ("orders", [
        ("id", TEXT, 1, "gen_uuid()", None), ("order_number", TEXT, 1, None, None), ("idempotency_key", TEXT, 1, None, None),
        ("user_id", TEXT, 1, None, None), ("status", TEXT, 1, "'new'", "order_status"),
        ("fulfillment", TEXT, 1, "'delivery'", "fulfillment_type"),
        ("payment_method", TEXT, 1, "'cash_on_delivery'", "payment_method"),
        ("payment_status", TEXT, 1, "'unpaid'", "payment_status"), ("currency", TEXT, 1, "'EGP'", None),
        ("subtotal", REAL, 1, "0", None), ("discount_total", REAL, 1, "0", None), ("delivery_fee", REAL, 1, "0", None),
        ("tax_total", REAL, 1, "0", None), ("total", REAL, 1, "0", None), ("points_redeemed", INT, 1, "0", None),
        ("points_earned", INT, 1, "0", None), ("address_snapshot", TEXT, 0, None, None), ("customer_note", TEXT, 0, None, None),
        ("eta_minutes", INT, 0, None, None), ("cancel_reason", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("accepted_at", TEXT, 0, None, None), ("prepared_at", TEXT, 0, None, None),
        ("dispatched_at", TEXT, 0, None, None), ("finished_at", TEXT, 0, None, None), ("canceled_at", TEXT, 0, None, None),
        ("restaurant_id", TEXT, 1, "current_restaurant_id()", None), ("offer_id", TEXT, 0, None, None),
        ("offer_name", TEXT, 0, None, None),
    ]),
    ("order_items", [
        ("id", TEXT, 1, "gen_uuid()", None), ("order_id", TEXT, 1, None, None), ("menu_item_id", TEXT, 0, None, None),
        ("name_snapshot", TEXT, 1, None, None), ("name_ar_snapshot", TEXT, 0, None, None), ("unit_price", REAL, 1, None, None),
        ("quantity", INT, 1, None, None), ("line_total", REAL, 1, None, None), ("modifiers", TEXT, 1, "'[]'", None),
        ("notes", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("order_status_history", [
        ("id", INT, 1, None, None), ("order_id", TEXT, 1, None, None), ("from_status", TEXT, 0, None, "order_status"),
        ("to_status", TEXT, 1, None, "order_status"), ("changed_by", TEXT, 0, None, None),
        ("changed_by_role", TEXT, 0, None, "staff_role"), ("note", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("notifications", [
        ("id", INT, 1, None, None), ("user_id", TEXT, 1, None, None), ("kind", TEXT, 1, None, None),
        ("title", TEXT, 1, None, None), ("body", TEXT, 0, None, None), ("link", TEXT, 0, None, None),
        ("broadcast_id", TEXT, 0, None, None), ("read_at", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
        ("audience", TEXT, 1, "'customer'", None), ("category", TEXT, 1, "'system'", None),
    ]),
    ("feedback", [
        ("id", TEXT, 1, "gen_uuid()", None), ("user_id", TEXT, 0, None, None), ("order_id", TEXT, 0, None, None),
        ("rating", INT, 1, None, None), ("category", TEXT, 1, "'overall'", "feedback_category"), ("title", TEXT, 0, None, None),
        ("message", TEXT, 1, None, None), ("image_urls", TEXT, 1, "'[]'", None), ("is_public", INT, 1, "0", None),
        ("status", TEXT, 1, "'new'", "feedback_status"), ("admin_response", TEXT, 0, None, None),
        ("responded_by", TEXT, 0, None, None), ("responded_at", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("conversations", [
        ("id", TEXT, 1, "gen_uuid()", None), ("user_id", TEXT, 1, None, None), ("subject", TEXT, 0, None, None),
        ("status", TEXT, 1, "'open'", "conversation_status"), ("related_order_id", TEXT, 0, None, None),
        ("last_message_at", TEXT, 1, "now()", None), ("customer_unread", INT, 1, "0", None),
        ("staff_unread", INT, 1, "0", None), ("assigned_to", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("messages", [
        ("id", TEXT, 1, "gen_uuid()", None), ("conversation_id", TEXT, 1, None, None), ("sender_id", TEXT, 1, None, None),
        ("sender_kind", TEXT, 1, None, None), ("body", TEXT, 1, None, None), ("attachments", TEXT, 1, "'[]'", None),
        ("is_internal_note", INT, 1, "0", None), ("read_at", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("team_threads", [
        ("id", TEXT, 1, "gen_uuid()", None), ("kind", TEXT, 1, None, None), ("name", TEXT, 1, None, None),
        ("slug", TEXT, 0, None, None), ("created_by", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
        ("last_message_at", TEXT, 1, "now()", None),
    ]),
    ("team_thread_members", [
        ("thread_id", TEXT, 1, None, None), ("user_id", TEXT, 1, None, None), ("joined_at", TEXT, 1, "now()", None),
        ("last_read_at", TEXT, 1, "now()", None),
    ]),
    ("team_messages", [
        ("id", INT, 1, None, None), ("thread_id", TEXT, 1, None, None), ("sender_id", TEXT, 0, None, None),
        ("body", TEXT, 1, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("activity_logs", [
        ("id", INT, 1, None, None), ("user_id", TEXT, 0, None, None), ("session_id", TEXT, 0, None, None),
        ("event", TEXT, 1, None, None), ("entity", TEXT, 0, None, None), ("entity_id", TEXT, 0, None, None),
        ("metadata", TEXT, 1, "'{}'", None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("analytics_events", [
        ("id", INT, 1, None, None), ("session_id", TEXT, 1, None, None), ("user_id", TEXT, 0, None, None),
        ("event", TEXT, 1, None, None), ("path", TEXT, 0, None, None), ("referrer", TEXT, 0, None, None),
        ("device", TEXT, 0, None, None), ("metadata", TEXT, 1, "'{}'", None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("audit_logs", [
        ("id", INT, 1, None, None), ("actor_id", TEXT, 0, None, None), ("actor_role", TEXT, 0, None, "staff_role"),
        ("action", TEXT, 1, None, None), ("entity", TEXT, 1, None, None), ("entity_id", TEXT, 0, None, None),
        ("before", TEXT, 0, None, None), ("after", TEXT, 0, None, None), ("ip", TEXT, 0, None, None),
        ("created_at", TEXT, 1, "now()", None),
    ]),
    ("exports", [
        ("id", TEXT, 1, "gen_uuid()", None), ("dataset", TEXT, 1, None, None), ("format", TEXT, 1, "'csv'", "export_format"),
        ("filters", TEXT, 1, "'{}'", None), ("status", TEXT, 1, "'queued'", "export_status"), ("row_count", INT, 0, None, None),
        ("storage_path", TEXT, 0, None, None), ("bytes", INT, 0, None, None), ("error", TEXT, 0, None, None),
        ("requested_by", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None), ("completed_at", TEXT, 0, None, None),
        ("expires_at", TEXT, 0, None, None), ("content", TEXT, 0, None, None), ("content_encoding", TEXT, 0, None, None),
    ]),
    ("backup_records", [
        ("id", TEXT, 1, "gen_uuid()", None), ("kind", TEXT, 1, None, "backup_kind"),
        ("status", TEXT, 1, "'queued'", "backup_status"), ("label", TEXT, 0, None, None), ("storage_path", TEXT, 0, None, None),
        ("bytes", INT, 0, None, None), ("manifest", TEXT, 1, "'{}'", None), ("error", TEXT, 0, None, None),
        ("created_by", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None), ("completed_at", TEXT, 0, None, None),
        ("format", TEXT, 1, "'json'", None), ("content", TEXT, 0, None, None), ("content_encoding", TEXT, 0, None, None),
    ]),
    ("ai_providers", [
        ("id", TEXT, 1, "gen_uuid()", None), ("name", TEXT, 1, None, None),
        ("kind", TEXT, 1, "'openai_compatible'", None), ("base_url", TEXT, 0, None, None), ("model", TEXT, 0, None, None),
        ("secret_ref", TEXT, 0, None, None), ("is_enabled", INT, 1, "0", None), ("is_fallback", INT, 1, "0", None),
        ("priority", INT, 1, "100", None), ("monthly_token_quota", INT, 0, None, None),
        ("max_requests_per_minute", INT, 1, "20", None), ("config", TEXT, 1, "'{}'", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("routes", TEXT, 1, "'{}'", None),
    ]),
    ("ai_prompts", [
        ("id", TEXT, 1, "gen_uuid()", None), ("key", TEXT, 1, None, None), ("name", TEXT, 1, None, None),
        ("system_instruction", TEXT, 1, None, None), ("temperature", REAL, 1, "0.2", None), ("max_tokens", INT, 1, "700", None),
        ("is_active", INT, 1, "1", None), ("updated_at", TEXT, 1, "now()", None), ("updated_by", TEXT, 0, None, None),
    ]),
    ("ai_requests", [
        ("id", TEXT, 1, "gen_uuid()", None), ("user_id", TEXT, 0, None, None), ("surface", TEXT, 1, "'assistant'", None),
        ("prompt_key", TEXT, 0, None, None), ("provider", TEXT, 0, None, None), ("model", TEXT, 0, None, None),
        ("latency_ms", INT, 0, None, None), ("prompt_tokens", INT, 0, None, None), ("completion_tokens", INT, 0, None, None),
        ("estimated_cost", REAL, 0, None, None), ("status", TEXT, 1, "'ok'", None), ("error", TEXT, 0, None, None),
        ("created_at", TEXT, 1, "now()", None), ("provider_errors", TEXT, 0, None, None),
    ]),
    ("ai_usage_daily", [
        ("day", TEXT, 1, None, None), ("provider", TEXT, 1, "'all'", None), ("requests", INT, 1, "0", None),
        ("errors", INT, 1, "0", None), ("prompt_tokens", INT, 1, "0", None), ("completion_tokens", INT, 1, "0", None),
        ("estimated_cost", REAL, 1, "0", None),
    ]),
    ("mcp_servers", [
        ("id", TEXT, 1, "gen_uuid()", None), ("name", TEXT, 1, None, None), ("url", TEXT, 1, None, None),
        ("transport", TEXT, 1, "'http'", None), ("auth_header", TEXT, 0, "'authorization'", None),
        ("secret_ref", TEXT, 0, None, None), ("allowed_tools", TEXT, 0, None, None), ("is_enabled", INT, 1, "1", None),
        ("last_probed_at", TEXT, 0, None, None), ("last_probe_ok", INT, 0, None, None), ("last_probe_error", TEXT, 0, None, None),
        ("created_at", TEXT, 1, "now()", None), ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("agent_threads", [
        ("id", TEXT, 1, "gen_uuid()", None), ("owner_id", TEXT, 0, None, None), ("owner_label", TEXT, 0, None, None),
        ("title", TEXT, 1, "'New conversation'", None), ("created_at", TEXT, 1, "now()", None),
        ("updated_at", TEXT, 1, "now()", None), ("summary", TEXT, 0, None, None), ("summary_upto", TEXT, 0, None, None),
    ]),
    ("agent_messages", [
        ("id", TEXT, 1, "gen_uuid()", None), ("thread_id", TEXT, 1, None, None), ("role", TEXT, 1, None, None),
        ("body", TEXT, 1, "''", None), ("steps", TEXT, 1, "'[]'", None), ("provider", TEXT, 0, None, None),
        ("model", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("agent_memory", [
        ("id", TEXT, 1, "gen_uuid()", None), ("scope", TEXT, 1, "'owner'", None), ("subject_id", TEXT, 0, None, None),
        ("kind", TEXT, 1, "'fact'", None), ("content", TEXT, 1, None, None), ("metadata", TEXT, 1, "'{}'", None),
        ("embedding", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None), ("has_embedding", INT, 0, None, None),
    ]),
    ("agent_skills", [
        ("id", TEXT, 1, "gen_uuid()", None), ("name", TEXT, 1, None, None), ("source", TEXT, 1, "'repo'", None),
        ("source_url", TEXT, 0, None, None), ("heading", TEXT, 0, None, None), ("content", TEXT, 1, None, None),
        ("chunk_index", INT, 1, "0", None), ("embedding", TEXT, 0, None, None), ("updated_at", TEXT, 1, "now()", None),
        ("created_at", TEXT, 1, "now()", None),
    ]),
    ("agent_artifacts", [
        ("id", TEXT, 1, "gen_uuid()", None), ("run_id", TEXT, 0, None, None), ("kind", TEXT, 1, None, None),
        ("title", TEXT, 1, None, None), ("summary", TEXT, 0, None, None), ("format", TEXT, 1, "'md'", None),
        ("status", TEXT, 1, "'building'", None), ("storage_path", TEXT, 0, None, None), ("bytes", INT, 0, None, None),
        ("row_count", INT, 0, None, None), ("data", TEXT, 1, "'{}'", None), ("error", TEXT, 0, None, None),
        ("created_by", TEXT, 0, None, None), ("created_at", TEXT, 1, "now()", None), ("completed_at", TEXT, 0, None, None),
        ("reuse_count", INT, 1, "0", None), ("last_reused_at", TEXT, 0, None, None),
    ]),
    ("agent_artifact_comments", [
        ("id", TEXT, 1, "gen_uuid()", None), ("artifact_id", TEXT, 1, None, None), ("author_id", TEXT, 0, None, None),
        ("author_label", TEXT, 0, None, None), ("body", TEXT, 1, None, None), ("created_at", TEXT, 1, "now()", None),
    ]),
    ("ops_agent_runs", [
        ("id", TEXT, 1, "gen_uuid()", None), ("kind", TEXT, 1, None, None), ("trigger", TEXT, 1, "'schedule'", None),
        ("status", TEXT, 1, "'running'", None), ("headline", TEXT, 0, None, None), ("summary", TEXT, 0, None, None),
        ("report", TEXT, 1, "'{}'", None), ("actions_proposed", INT, 1, "0", None), ("provider", TEXT, 0, None, None),
        ("model", TEXT, 0, None, None), ("error", TEXT, 0, None, None), ("duration_ms", INT, 0, None, None),
        ("started_at", TEXT, 1, "now()", None), ("finished_at", TEXT, 0, None, None),
    ]),
    ("ops_agent_actions", [
        ("id", TEXT, 1, "gen_uuid()", None), ("run_id", TEXT, 0, None, None), ("kind", TEXT, 1, None, None),
        ("title", TEXT, 1, None, None), ("rationale", TEXT, 0, None, None), ("payload", TEXT, 1, "'{}'", None),
        ("status", TEXT, 1, "'proposed'", None), ("requires_approval", INT, 1, "1", None), ("requested_by", TEXT, 0, None, None),
        ("decided_by", TEXT, 0, None, None), ("decided_at", TEXT, 0, None, None), ("decision_note", TEXT, 0, None, None),
        ("applied_at", TEXT, 0, None, None), ("applied_ref", TEXT, 0, None, None), ("error", TEXT, 0, None, None),
        ("created_at", TEXT, 1, "now()", None),
    ]),
    ("ops_agent_settings", [
        ("id", INT, 1, "1", None), ("is_enabled", INT, 1, "1", None), ("report_interval_hours", INT, 1, "24", None),
        ("backup_interval_hours", INT, 1, "168", None), ("proposals_enabled", INT, 1, "1", None),
        ("last_report_at", TEXT, 0, None, None), ("last_backup_at", TEXT, 0, None, None), ("updated_by", TEXT, 0, None, None),
        ("updated_at", TEXT, 1, "now()", None),
    ]),
    ("auth_users", [
        ("id", TEXT, 1, None, None), ("email", TEXT, 0, None, None), ("encrypted_password", TEXT, 0, None, None),
        ("phone", TEXT, 0, None, None), ("email_confirmed_at", TEXT, 0, None, None), ("phone_confirmed_at", TEXT, 0, None, None),
        ("raw_app_meta_data", TEXT, 0, None, None), ("raw_user_meta_data", TEXT, 0, None, None),
        ("created_at", TEXT, 1, None, None), ("updated_at", TEXT, 1, None, None), ("last_sign_in_at", TEXT, 0, None, None),
        ("banned_until", TEXT, 0, None, None), ("is_sso_user", INT, 1, "0", None),
    ]),
    ("auth_identities", [
        ("id", TEXT, 1, None, None), ("user_id", TEXT, 1, None, None), ("provider", TEXT, 1, None, None),
        ("provider_id", TEXT, 1, None, None), ("identity_data", TEXT, 0, None, None), ("created_at", TEXT, 1, None, None),
        ("last_sign_in_at", TEXT, 0, None, None),
    ]),
]

# Tables whose primary key is not the first column alone.
COMPOSITE_PK = {
    "customer_tag_links": ("customer_id", "tag_id"),
    "team_thread_members": ("thread_id", "user_id"),
    "menu_item_ratings": ("menu_item_id",),
}

UNIQUES = [
    ("restaurants_slug_key", "restaurants", ["slug"]),
    ("categories_slug_key", "categories", ["slug"]),
    ("menu_items_slug_key", "menu_items", ["slug"]),
    ("menu_items_external_id_key", "menu_items", ["external_id"]),
    ("orders_order_number_key", "orders", ["order_number"]),
    ("orders_idempotency_idx", "orders", ["user_id", "idempotency_key"]),
    ("feature_flags_key", "feature_flags", ["key"]),
    ("settings_key", "settings", ["key"]),
    ("profiles_email_key", "profiles", ["email"]),
    ("profiles_phone_key", "profiles", ["phone"]),
    ("auth_users_email_key", "auth_users", ["email"]),
    ("ai_prompts_key_key", "ai_prompts", ["key"]),
    ("ai_providers_name_key", "ai_providers", ["name"]),
    ("mcp_servers_name_key", "mcp_servers", ["name"]),
    ("customer_tags_key_key", "customer_tags", ["key"]),
    ("team_threads_slug_key", "team_threads", ["slug"]),
]

INDEXES = [
    ("menu_items_active_idx", "menu_items", ["category_id", "sort_order"]),
    ("menu_items_featured_idx", "menu_items", ["is_featured"]),
    ("categories_sort_idx", "categories", ["is_enabled", "sort_order"]),
    ("orders_user_idx", "orders", ["user_id", "created_at"]),
    ("orders_status_idx", "orders", ["status", "created_at"]),
    ("orders_created_idx", "orders", ["created_at"]),
    ("order_items_order_idx", "order_items", ["order_id"]),
    ("order_status_history_order_idx", "order_status_history", ["order_id", "created_at"]),
    ("addresses_user_idx", "addresses", ["user_id", "is_default"]),
    ("notifications_user_idx", "notifications", ["user_id", "created_at"]),
    ("messages_conversation_idx", "messages", ["conversation_id", "created_at"]),
    ("menu_images_item_idx", "menu_images", ["menu_item_id", "sort_order"]),
    ("modifier_groups_item_idx", "modifier_groups", ["menu_item_id"]),
    ("modifier_options_group_idx", "modifier_options", ["group_id"]),
    ("analytics_events_created_idx", "analytics_events", ["created_at"]),
    ("activity_logs_created_idx", "activity_logs", ["created_at"]),
    ("audit_logs_created_idx", "audit_logs", ["created_at"]),
]


def render() -> str:
    out = [
        "-- Panda Wok D1 schema.",
        "-- Generated by scripts/d1/generate-schema.py from the live Postgres schema.",
        "--   uuid/vector/citext/text[] -> TEXT (arrays as JSON), timestamptz/date -> TEXT ISO-8601 UTC,",
        "--   jsonb -> TEXT (JSON), bool -> INTEGER 0/1, int2/4/8 -> INTEGER, numeric/float -> REAL.",
        "--   enums -> TEXT + CHECK. Money stays REAL (float64) so a price reads back exactly as written.",
        "",
        "PRAGMA foreign_keys = ON;",
        "",
    ]
    for name, cols in TABLES:
        lines = []
        for col, ty, nn, default, enum in cols:
            piece = '  "%s" %s' % (col, ty)
            if enum:
                allowed = ", ".join("'%s'" % v for v in ENUMS[enum])
                piece += ' CHECK ("%s" IN (%s))' % (col, allowed)
            if nn:
                piece += " NOT NULL"
            if default == "gen_uuid()":
                piece += " DEFAULT %s" % UUID_EXPR
            elif default in DEFAULT_MAP:
                piece += " DEFAULT %s" % DEFAULT_MAP[default]
            elif default and default != SHIM_FILLED_DEFAULT:
                piece += " DEFAULT %s" % default
            lines.append(piece)
        body = ",\n".join(lines)
        pk = COMPOSITE_PK.get(name, (cols[0][0],))
        body += ',\n  PRIMARY KEY (%s)' % ", ".join('"%s"' % c for c in pk)
        out.append('CREATE TABLE IF NOT EXISTS "%s" (\n%s\n);' % (name, body))
        out.append("")

    out.append("-- Uniques the app relies on (slug lookup, signup, order idempotency).")
    for idx, table, cols in UNIQUES:
        out.append('CREATE UNIQUE INDEX IF NOT EXISTS "%s" ON "%s"(%s);' % (
            idx, table, ", ".join('"%s"' % c for c in cols)))
    out.append("")
    out.append("-- Indexes for the hot read paths.")
    for idx, table, cols in INDEXES:
        out.append('CREATE INDEX IF NOT EXISTS "%s" ON "%s"(%s);' % (
            idx, table, ", ".join('"%s"' % c for c in cols)))
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    import sys
    text = render()
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w") as handle:
            handle.write(text)
        print("wrote %s (%d tables, %d bytes)" % (sys.argv[1], len(TABLES), len(text)))
    else:
        sys.stdout.write(text)
