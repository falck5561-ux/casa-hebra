# Casa Hebra server

Express API, image storage, authentication and atomic JSON persistence for the
Casa Hebra catalogue.

## Run locally

```bash
npm install
npm run dev
```

Run those commands from the project root. They start the API and Vite client;
visit `http://127.0.0.1:5173/admin`. The development API listens only on
`127.0.0.1:8787` by default. The first visit to the admin screen creates the sole owner account; public registration is never
enabled. In development, setup without `SETUP_TOKEN` is accepted only over a
loopback socket, Host and browser Origin (`localhost`/`127.0.0.1`/`::1`). If you
manually expose a development proxy to the LAN, set `SETUP_TOKEN` first and add
the deliberate development origin to `PUBLIC_ORIGIN` when the proxy topology
requires it.

## Production

Build the client first and run `npm start` (or `npm run start:prod`). These
commands force `NODE_ENV=production` on every platform. The server serves
`../client/dist` automatically, or `CLIENT_DIST` when configured. Before the
first production start, set `PUBLIC_ORIGIN` to the canonical HTTPS origin and a
random `SETUP_TOKEN` of at least 16 characters. `PUBLIC_ORIGIN` remains required
on every later production start; `SETUP_TOKEN` is only needed until the owner
exists. Generate at least 24 random bytes, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Enter that token in the first-run admin form (or send it as `setupToken` in the
setup JSON / `X-Setup-Token` header). It is compared in constant time and is
never persisted. Remove `SETUP_TOKEN` from the environment after the owner is
created; the setup endpoint remains permanently locked. Keep the app behind a
TLS reverse proxy. Production responses also emit a one-year HSTS policy.

`DATA_DIR` contains `store.json` and uploaded images. **It must point to a
persistent disk in production.** JSON writes are atomic and serialized inside
one Node process. Run a single server process for this storage design; use a
database/object store before scaling to multiple writers. Back up the entire
directory regularly.

## Data upgrades and private admin insights

Schema version 3 keeps the 20-piece Casa Hebra catalogue and adds a bounded
product price history. When startup finds schema version 2, it adds the new
history collection without changing products, business settings, the owner
account, active sessions or inquiries. When it finds the untouched
eight-product demo catalogue from schema version 1, it replaces only the
catalogue collections. If any legacy product or category was changed, added or
removed through the admin, that catalogue is kept instead.

A real price change made through `PUT /api/admin/products/:id` stores its old
price, new price, currency and timestamp. Re-saving the same price creates no
duplicate. At most 1,000 records are retained globally, the 200 newest are
included in `/api/admin/bootstrap`, and
`GET /api/admin/products/:id/price-history` returns the recent history for one
product. Deleting a product also removes its price history as a data-minimizing
measure.

The admin bootstrap also includes aggregate consultation insights calculated
from retained inquiries: total catalogue/custom inquiries, requested units and
per-product consultation counts. These figures reuse records the customer
explicitly submitted; the public storefront does not gain view tracking,
cookies, visitor identifiers or IP logging.

Bundled image paths under `/products/` are explicitly allowed by validation.
Keep the allowlist in `src/validation.js`, the paths in `src/defaults.js` and
the files in `client/public/products/` in sync; the pure test suite checks the
catalogue invariants.

Uploaded files are limited to five images per request and 6 MB per image.
JPEG, PNG and WebP are verified by their real file signatures and dimensions,
renamed with random IDs, and stripped of EXIF/XMP/text metadata (including
embedded GPS data) before being published. SVG uploads are not accepted.
Animated images and JPEG files that depend on EXIF rotation are rejected with
a clear error; rotate/save those photos once before uploading. Unused uploads
are removed after a 24-hour grace period, and local image storage is capped at
512 MB so an abandoned editing session cannot grow the disk without limit.

The owner password must contain 10–128 characters, including at least one
letter and one number. Sessions last 12 hours and are stored only as SHA-256
token hashes; the browser cookie is `HttpOnly`, `SameSite=Lax`, and `Secure`
in production.

PNG uploads receive full container, CRC, scanline and compressed-data
validation. JPEG and WebP uploads receive strict container/segment validation;
their native pixel streams are not re-encoded because the server intentionally
has no native image dependency. For installations that need forensic image
decoding or automatic rotation, add a maintained decoder such as libvips at the
edge before this service.

Inquiries are pruned automatically after 180 days and the JSON store keeps at
most 1,000 inquiry records. `INQUIRY_RETENTION_DAYS` can only reduce the
180-day period; `MAX_INQUIRIES` can be set between 1 and 5,000. The public
response exposes the effective retention period and includes
the canonical WhatsApp message and URL assembled from the server-validated
product snapshot; client-supplied prices and names are ignored. Each inquiry
also snapshots its currency. Submissions require explicit privacy acceptance;
only its timestamp and policy version are retained as the consent record.

Location text validation blocks common address, map-link, coordinate and number
patterns in public pickup/city fields. This is a pragmatic safeguard, not a
mathematical guarantee: review published copy and never enter a home address.

Supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port |
| `NODE_ENV` | `development` | Used by `dev`; production scripts force `production` |
| `DATA_DIR` | `server/data` | Persistent JSON and upload directory |
| `CLIENT_DIST` | `client/dist` | Built client to serve |
| `PUBLIC_ORIGIN` | empty | Allowed HTTPS origins; required for every production start |
| `SETUP_TOKEN` | empty | First-owner secret (16+ chars; 24 random bytes recommended) |
| `INQUIRY_RETENTION_DAYS` | `180` | Automatic inquiry retention, from 1 to 180 days |
| `MAX_INQUIRIES` | `1000` | Global inquiry cap, from 1 to 5,000 records |
| `TRUST_PROXY` | `false` | Set to `1` behind one trusted reverse proxy |

Useful commands:

```bash
npm run check
npm test
npm run test:pure
npm run test:integration
npm run start:prod
```

`test:pure` has no Express runtime requirement. `test:integration` fails fast
when dependencies have not been installed, so CI/deployment checks cannot
silently omit the HTTP flows.
