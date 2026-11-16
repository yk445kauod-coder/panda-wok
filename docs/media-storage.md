# Dish photo storage (DBByte)

Every dish photo is stored in **DBByte object storage** and served through the
**`panda-wok-media` Worker**. Neither Supabase Storage nor R2 is on the path any
more.

## Why

Dish photos used to live in Supabase Storage (`menu-images`). Serving them burned
the project's cached-egress quota until the whole API answered **HTTP 402**, which
broke every dish photo on the menu. DBByte is a separate S3-compatible store with
its own CDN and bandwidth allowance, so photo traffic no longer touches Supabase
at all.

## Topology

```
admin form ──POST──▶ uploadMenuImageAction (Next server action, server key)
                          │
                          ▼
                    DBByte  /storage/panda-wok-media/upload
                          │
   image_url = https://panda-wok-media.<account>.workers.dev/media/dish-<id>.png
                          │
browser ──GET──────────▶ panda-wok-media Worker ──cache HIT──▶ browser
                          │  cache MISS
                          ▼
                    DBByte  /storage/panda-wok-media/download/<name>
```

- **Upload** is server-side: the browser posts the `File` to the action, which
  checks the caller's `menu.manage` capability, the type and the size, then
  writes with the server-held key. The key never reaches the browser and the
  object store stays private.
- **Read** goes through the Worker. The Worker holds the key as a **secret**, so
  a private bucket can still be served to the public — and each object is cached
  at Cloudflare's edge for a year.

## Why names are content-addressed

Each upload mints a fresh `dish-<8 hex>-<uuid>.<ext>`. That is what makes the
one-year cache safe: a replacement is a **new URL**, so no cache anywhere (edge,
CDN or browser) can ever serve the previous photo. "Edit the photo" and "add a
photo to an existing dish" therefore show up immediately, with no purge needed.

## Secrets and configuration

| Where | Name | What |
|---|---|---|
| Worker secret | `DBBYTE_KEY` | `dbk_...` API key. **Never** in `wrangler.jsonc`. |
| Worker var | `DBBYTE_BUCKET` | `panda-wok-media` |
| Worker var | `DBBYTE_ENDPOINT` | `https://api.dbbyte.com` |
| Worker var | `SITE_ORIGIN` | the site origin, for the CORS header |
| Site secret | `DBBYTE_KEY` | same key, read by the upload action |
| Site var | `DBBYTE_BUCKET` | `panda-wok-media` |
| Site var | `NEXT_PUBLIC_MEDIA_ORIGIN` | the Worker origin in every image URL |

`NEXT_PUBLIC_MEDIA_ORIGIN` is public by design — it is in every `<img>` the
browser fetches. `DBBYTE_KEY` is a server-only secret in both places.

## Deploy the Worker

```bash
cd workers/media-proxy
npx wrangler secret put DBBYTE_KEY     # paste the dbk_... key
npx wrangler deploy
```

`/health` answers `ok`; a GET of `/media/<name>` streams the object; a name that
does not match the object pattern is a 404, so the Worker is not an open proxy.

## Purge one object (replace-in-place only)

```bash
curl -X POST -H "Authorization: Bearer $DBBYTE_KEY" \
  "https://panda-wok-media.<account>.workers.dev/purge?name=dish-....png"
```

Not needed for a normal edit (a new upload is a new name). It exists for the rare
case of overwriting a name in place.

## Migrating old photos

The existing photos still live in Supabase Storage and stay broken while the
project is over its quota. This change does **not** migrate them; it makes every
new upload and edit use DBByte. To recover the old objects, pull them from
Supabase Storage and `PutObject` them into `panda-wok-media` under the same names
(the Worker serves them by name), then leave `image_url` untouched.
