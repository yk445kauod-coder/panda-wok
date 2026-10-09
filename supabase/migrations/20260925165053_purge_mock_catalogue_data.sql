-- Removes every seed specimen row. The app renders honest empty states and the
-- admin CMS is the single source of truth for the real menu. Kept: restaurants,
-- settings (real contact/socials/delivery config), staff, feature_flags,
-- ai_providers (the Workers AI binding) and ai_prompts (actual system prompts).
begin;
  delete from modifier_options;
  delete from modifier_groups;
  delete from menu_item_stock;
  delete from stock_movements;
  delete from stock_items;
  delete from menu_items;
  delete from categories;
  delete from loyalty_redemptions;
  delete from loyalty_rewards;
  delete from upsell_rules;
  delete from menu_images;
  delete from page_seo;
  delete from page_content;
  delete from faqs;
  delete from delivery_zones;
  delete from announcements;
  delete from ai_knowledge_sources;
  delete from ai_requests;
  delete from ai_usage_daily;
  delete from analytics_events;
  delete from activity_logs;
commit;