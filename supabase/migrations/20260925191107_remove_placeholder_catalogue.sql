-- Remove the placeholder catalogue that shipped before the real menu existed.
--
-- The only rows were a single "Sushi" item priced EGP 11 whose image was the
-- brand logo, plus its category — clearly scaffolding, not the kitchen's menu.
-- There are no orders, order items, modifier groups, loyalty rewards, stock
-- rows, upsell rules, FAQs, published page content, announcements or delivery
-- zones to touch (all verified empty), so nothing real is deleted here.
--
-- The menu is now authored entirely through the admin CMS; the storefront
-- renders an honest empty state until the kitchen publishes it.
delete from menu_items where id = 'bee375ca-b421-4a2c-8a8d-92edc623a2f4';
delete from categories where id = '4c9a6a4c-b40a-49f6-8d61-6c7ddef52d9e';
