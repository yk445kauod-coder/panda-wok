# Dish photo storage (DBByte, S3)

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
                    DBByte S3  PUT  s3.dbbyte.com/panda-wok-media/<name>
                          │
   image_url = https://panda-wok-media.<account>.workers.dev/media/dish-<id>.png
                          │
browser ──GET──────────▶ panda-wok-media Worker ──cache HIT──▶ browser
                          │  cache MISS
                          ▼
                    DBByte S3  GET  s3.dbbyte.com/panda-wok-media/<name>
```

- **Upload** is server-side: the browser posts the `File` to the action, which
  checks the caller's `menu.manage` capability, the type and the size, then
  writes with the server-held key. The key never reaches the browser and the
  object store stays private.
- **Read** goes through the Worker. The Worker holds the key as a **secret**, so
  a private bucket can still be served to the public — and each object is cached
  at Cloudflare's edge for a year.
- Both sides speak **S3** and sign with `aws4fetch` (SigV4), so the same protocol
  works in a Worker and in a Next server action without the AWS SDK.

## Why names are content-addressed

Each upload mints a fresh `dish-<8 hex>-<uuid>.<ext>`. That is what makes the
one-year cache safe: a replacement is a **new URL**, so no cache anywhere (edge,
CDN or browser) can ever serve the previous photo. "Edit the photo" and "add a
photo to an existing dish" therefore show up immediately, with no purge needed.

## Secrets and configuration

| Where | Name | What |
|---|---|---|
| Worker secret | `DBBYTE_SECRET_ACCESS_KEY` | `dbk_...` secret key. **Never** in `wrangler.jsonc`. |
| Worker var | `DBBYTE_ACCESS_KEY_ID` | `dbs_...` access key id (an identifier, not the secret half) |
| Worker var | `DBBYTE_BUCKET` | `panda-wok-media` |
| Worker var | `DBBYTE_ENDPOINT` | `https://s3.dbbyte.com` |
| Worker var | `SITE_ORIGIN` | the site origin, for the CORS header |
| Site secret | `DBBYTE_SECRET_ACCESS_KEY` | same key, read by the upload action |
| Site var | `DBBYTE_ACCESS_KEY_ID` | same id |
| Site var | `DBBYTE_BUCKET` | `panda-wok-media` |
| Site var | `NEXT_PUBLIC_MEDIA_ORIGIN` | the Worker origin in every image URL |

`NEXT_PUBLIC_MEDIA_ORIGIN` is public by design — it is in every `<img>` the
browser fetches. `DBBYTE_SECRET_ACCESS_KEY` is a server-only secret in both
places. The bucket is **private**: an unsigned GET answers `403`, so the media
Worker is the only way a browser reads an object.

## Deploy the Worker

```bash
npx wrangler secret put DBBYTE_SECRET_ACCESS_KEY --config workers/media-proxy/wrangler.jsonc
npx wrangler deploy --config workers/media-proxy/wrangler.jsonc
```

`/health` answers `ok`; a GET of `/media/<name>` streams the object; a name that
does not match the object pattern is a 404, so the Worker is not an open proxy.

## Purge one object (replace-in-place only)

```bash
curl -X POST -H "Authorization: Bearer $DBBYTE_SECRET_ACCESS_KEY" \
  "https://panda-wok-media.<account>.workers.dev/purge?name=dish-....png"
```

Not needed for a normal edit (a new upload is a new name). It exists for the rare
case of overwriting a name in place.

## Migrating old photos

The existing photos still live in Supabase Storage and stay broken while the
project is over its quota. This change does **not** migrate them; it makes every
new upload and edit use DBByte S3. To recover the old objects, pull them from
Supabase Storage and `PutObject` them into `panda-wok-media` under the same names
(the Worker serves them by name), then leave `image_url` untouched.
