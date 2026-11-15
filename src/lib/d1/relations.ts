/**
 * How embedded relations join, table by table.
 *
 * PostgREST resolved a `select("..., child(...)")` from the foreign keys in the
 * schema. SQLite/D1 has none, so the shim has to know each relationship. It used
 * to derive the join column from the table name (`<singular>_id`), which is
 * correct for a child's back-reference (`order_items.order_id`) but wrong for
 * every relation that links through a differently-named column: a customer
 * profile hangs off `orders.user_id`, an option hangs off
 * `modifier_options.group_id`, and a tag reaches a note through the
 * `customer_tag_links` join table. Guessing produced an empty relation, and the
 * screen rendered as if the data were simply missing.
 *
 * The entries mirror the foreign keys the Postgres schema declared — including
 * `20260926075453_profile_relationship_fks.sql`, which added the `…_id →
 * profiles(id)` keys the admin embeds rely on. `join` names the intermediate
 * table for a many-to-many (there is no column on either side to match).
 *
 * `resolveEmbedLink` falls back to the naming heuristic for a pair that is not
 * listed, so an unlisted relation keeps the previous behaviour instead of
 * failing.
 */

export type EmbedLink = {
  /** Column on the parent row holding the id to match on. */
  parentKey: string;
  /** Column on the child row holding the id to match on. */
  childKey: string;
  /**
   * Many-to-many: the pair is linked through `table`, matching
   * `parentColumn` on the parent side and `childColumn` on the child side.
   */
  join?: { table: string; parentColumn: string; childColumn: string };
};

/** `EMBED_LINKS[parentTable][childTable]`. */
export const EMBED_LINKS: Record<string, Record<string, EmbedLink>> = {
  menu_items: {
    categories: { parentKey: "category_id", childKey: "id" },
    modifier_groups: { parentKey: "id", childKey: "menu_item_id" },
    // An item's options live one level down, through its modifier groups.
    modifier_options: {
      parentKey: "id",
      childKey: "menu_item_id",
      join: { table: "modifier_groups", parentColumn: "menu_item_id", childColumn: "id" },
    },
    menu_images: { parentKey: "id", childKey: "menu_item_id" },
  },
  categories: {
    menu_items: { parentKey: "id", childKey: "category_id" },
  },
  modifier_groups: {
    menu_items: { parentKey: "menu_item_id", childKey: "id" },
    modifier_options: { parentKey: "id", childKey: "group_id" },
  },
  modifier_options: {
    modifier_groups: { parentKey: "group_id", childKey: "id" },
  },
  menu_images: {
    menu_items: { parentKey: "menu_item_id", childKey: "id" },
  },
  orders: {
    order_items: { parentKey: "id", childKey: "order_id" },
    order_status_history: { parentKey: "id", childKey: "order_id" },
    // A customer profile hangs off the order's `user_id`, not `profile_id`.
    profiles: { parentKey: "user_id", childKey: "id" },
    offers: { parentKey: "offer_id", childKey: "id" },
  },
  order_items: {
    orders: { parentKey: "order_id", childKey: "id" },
    menu_items: { parentKey: "menu_item_id", childKey: "id" },
  },
  offers: {
    profiles: { parentKey: "customer_id", childKey: "id" },
  },
  feedback: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  staff: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  conversations: {
    profiles: { parentKey: "user_id", childKey: "id" },
    messages: { parentKey: "id", childKey: "conversation_id" },
  },
  messages: {
    conversations: { parentKey: "conversation_id", childKey: "id" },
  },
  customer_tag_links: {
    customer_tags: { parentKey: "tag_id", childKey: "id" },
  },
  customer_notes: {
    // A note carries no tag column: the link is the join table.
    customer_tags: {
      parentKey: "customer_id",
      childKey: "id",
      join: { table: "customer_tag_links", parentColumn: "customer_id", childColumn: "tag_id" },
    },
  },
  addresses: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  notifications: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  analytics_events: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  activity_logs: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  ai_requests: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  loyalty_accounts: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  loyalty_transactions: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  loyalty_redemptions: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
  broadcast_recipients: {
    profiles: { parentKey: "user_id", childKey: "id" },
  },
};

const IRREGULAR: Record<string, string> = {
  addresses: "address",
  categories: "category",
  messages: "message",
  faqs: "faq",
  identities: "identity",
};

function singular(table: string): string {
  if (IRREGULAR[table]) return IRREGULAR[table];
  if (table.endsWith("ies")) return table.slice(0, -3) + "y";
  if (table.endsWith("ses")) return table.slice(0, -2);
  if (table.endsWith("s")) return table.slice(0, -1);
  return table;
}

/**
 * The link for one parent→child embed.
 *
 * A listed pair wins and is `exact`. Otherwise the naming heuristic is used
 * (`inferred`), which handles the common child-holds-the-FK case for a relation
 * nobody has listed yet; the caller verifies an inferred link against the schema
 * rather than trusting it.
 */
export function resolveEmbedLink(
  parentTable: string,
  childTable: string,
): EmbedLink & { exact: boolean } {
  const known = EMBED_LINKS[parentTable]?.[childTable];
  if (known) return { ...known, exact: true };
  return {
    parentKey: "id",
    childKey: `${singular(parentTable)}_id`,
    exact: false,
  };
}
