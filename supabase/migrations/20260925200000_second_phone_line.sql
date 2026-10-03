-- The two published numbers are ordinary phone lines, not WhatsApp. The
-- `support.whatsapp` key made the site render a `wa.me` deep link to a number
-- that has no WhatsApp account, so tapping it failed for every customer.
--
-- Model them for what they are: a second phone line. `support.whatsapp` is
-- removed rather than left null, so nothing can start treating it as a chat
-- handle again.
insert into public.settings (key, value, is_public)
values ('support.phone_secondary', to_jsonb('01500988196'::text), true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;

delete from public.settings where key = 'support.whatsapp';
