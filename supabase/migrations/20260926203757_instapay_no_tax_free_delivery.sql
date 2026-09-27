-- Panda Wok :: InstaPay, no tax, no per-dish prep time, free-delivery banner
--
-- Owner directives, all four in one migration because three of them are
-- one-line setting changes and the fourth is a new payment option:
--
-- 1. PAYMENT. Cash on delivery and InstaPay are the two methods the kitchen
--    actually accepts. 'instapay' is added to the `payment_method` enum rather
--    than reusing 'online': the money moves through InstaPay, not a card
--    processor, and the admin needs to tell them apart when reconciling.
--    'card_on_delivery' stays in the enum because historical orders reference
--    it, but the app no longer offers it (same reasoning as 'pickup').
--
-- 2. TAX IS ZERO. `tax.rate` drives both the DB total and the checkout line,
--    so setting it to 0 removes the charge everywhere without a code change.
--    The checkout hides the "Tax (0%)" row when the rate is 0, because a
--    zero-value line is noise.
--
-- 3. NO PER-DISH PREP TIME. Every dish carried the 15-minute column default,
--    so every card showed the same "15 min" chip and every order got the same
--    ETA. Zeroed on all rows and the default changed to 0 so a dish created in
--    the CMS does not reintroduce it. The delivery ETA shown to customers comes
--    from the `delivery.eta_minutes` setting, which is unchanged.
--
-- 4. FREE DELIVERY. The owner is announcing free delivery on the home page, so
--    the fee has to actually be zero — advertising "free delivery" while
--    charging EGP 30 would be the kind of claim this project does not make. The
--    banner is a real `announcements` row (en + ar) so the owner can edit or
--    switch it off from Admin -> Content, and the fee/threshold are set to 0 so
--    the banner is true.

-- ------------------------------------------------------------------ payments

alter type payment_method add value if not exists 'instapay';

-- ---------------------------------------------------------------- settings

-- The InstaPay payment link, shown at checkout and in the assistant's grounding.
-- Public: it is a payment address the customer is meant to open, not a secret.
insert into settings (key, value, is_public)
values ('support.instapay_url', to_jsonb('https://ipn.eg/S/mohamedhedeia/instapay/7rTeeO'::text), true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;

update settings set value = to_jsonb(0::numeric) where key = 'tax.rate';

-- Free delivery: both the fee and the threshold, so no basket can be charged.
update settings set value = to_jsonb(0::numeric) where key = 'delivery.fee';
update settings set value = to_jsonb(0::numeric) where key = 'delivery.free_over';

-- --------------------------------------------------------------- prep time

update menu_items set prep_minutes = 0 where prep_minutes <> 0;

alter table menu_items alter column prep_minutes set default 0;

-- `place_order` derived the order ETA from `max(prep_minutes) + 20`. With prep
-- zeroed that would quote every customer 20 minutes instead of the kitchen's
-- real 35, so the ETA now reads the `delivery.eta_minutes` setting — the same
-- figure the marketing pages already show. Guarded in-place replacement, so
-- re-running is a no-op rather than a second rewrite.
do $$
declare
  v_def text;
  v_old text := 'eta_minutes = v_minutes + 20';
  v_repl text := 'eta_minutes = public.setting_numeric(''delivery.eta_minutes'', 35)::int';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'place_order';
  if position(v_old in v_def) = 0 then
    return;
  end if;
  execute replace(v_def, v_old, v_repl);
end $$;

-- -------------------------------------------------------- delivery banner

-- Idempotent: re-running replaces the copy rather than stacking duplicates.
insert into announcements (locale, message, href, tone, is_active, sort_order)
select 'en', 'Free delivery on every order', '/menu', 'success', true, 0
where not exists (
  select 1 from announcements where locale = 'en' and message = 'Free delivery on every order'
);

insert into announcements (locale, message, href, tone, is_active, sort_order)
select 'ar', 'التوصيل مجاني على كل الطلبات', '/menu', 'success', true, 0
where not exists (
  select 1 from announcements where locale = 'ar' and message = 'التوصيل مجاني على كل الطلبات'
);
