import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#"))
    .map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ts = Date.now();
const email = `qa.probe.${ts}@panda-wok.test`;
const pass = `QaProbe!${ts}`;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// 1) real customer signup
const { data: su, error: se } = await sb.auth.signUp({ email, password: pass });
if (se) { console.error("signup failed", se.message); process.exit(1); }
const uid = su.user.id;
console.log("customer:", uid);

// 2) give the customer an address
const { data: addr, error: ae } = await sb.from("addresses").insert({
  user_id: uid, label: "QA", contact_name: "QA Probe", contact_phone: "01000000000",
  address_line: "1 QA Test St", area: "QA", city: "Cairo",
}).select("id").single();
if (ae) { console.error("address failed", ae.message); process.exit(1); }
console.log("address:", addr.id);

// 3) pick an available menu item
const { data: items } = await sb.from("menu_items").select("id,name_en,price").eq("is_available",true).eq("is_archived",false).limit(50);
const item = items.find(i => Number(i.price) >= 250) ?? items[0];
console.log("item:", item.name_en, item.price);

// 4) place the order through the real RPC
const key = `qa-${ts}-${Math.random().toString(36).slice(2,10)}`;
const t0 = Date.now();
const { data: placed, error: pe } = await sb.rpc("place_order", {
  p_idempotency_key: key,
  p_items: [{ menu_item_id: item.id, quantity: 1, modifiers: [], notes: null }],
  p_address_id: addr.id,
  p_fulfillment: "delivery",
  p_payment_method: "cash_on_delivery",
});
const placeMs = Date.now() - t0;
if (pe) { console.error("place failed", pe.message); process.exit(1); }
const order = Array.isArray(placed) ? placed[0] : placed;
console.log(`ORDER PLACED in ${placeMs}ms ->`, JSON.stringify(order));

writeFileSync("/tmp/qa-order.json", JSON.stringify({ uid, email, pass, orderId: order.order_id, orderNumber: order.order_number, placedAt: Date.now() }));
console.log("saved /tmp/qa-order.json");
