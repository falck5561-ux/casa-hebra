# Casa Hebra — implementation contract

## Product goal

A polished, mobile-first crochet catalogue for a small local business. Visitors can browse products, choose variants, build an inquiry and open a fully prefilled WhatsApp message. There is no online checkout and no public home address. The pickup point and time are agreed privately in WhatsApp.

## Brand

- Name: Casa Hebra
- Tagline: Hecho a mano, punto por punto.
- Voice: warm, clear, handcrafted, premium but approachable
- Palette: warm ivory `#FBF8F3`, cocoa ink `#2F211D`, berry `#963D64` and soft rose/sage accents; dark canvas `#131210` with warm white text. The owner accent is adjusted per theme to preserve contrast.
- Visual motif: warm contemporary crochet workshop, real product photography on a clean ivory studio matte, soft rose/sage accents, restrained yarn details, friendly serif display headings and highly readable sans-serif body copy
- Appearance: polished light and dark themes with accessible contrast, initialized from the device preference and then persisted per browser; a branded yarn/stitch motion language remains subtle and respects reduced-motion preferences

## Bundled collection

- 20 real Casa Hebra products across four collections: `Llaveros tejidos`,
  `Mini amigurumis`, `Flores tejidas` and `Sets para regalar`.
- Product photographs have been cleaned of domestic backgrounds and optimized
  for storefront presentation.
- MXN prices supplied by the owner are bundled for 15 products; the five pieces
  absent from the handwritten list retain their previous value pending review.
  All prices remain editable in Admin. Girasol sizes are `Mediano · $90` and
  `Grande · $105`, with the selected size determining the inquiry total.
- Every bundled product starts as `made_to_order`; availability, lead time and
  any customization are confirmed through WhatsApp.

## Data model

### Settings

Root `schemaVersion` is `4`. Settings include `storeName`, `tagline`,
`heroTitle`, `heroText`, `story`, `whatsappNumber`, `city`, `pickupLabel`,
`currency`, `instagram`, `businessHours`, `announcement`, `accentColor`.
Default `whatsappNumber`: `+5219811681460`.

The product does not request an address and is designed not to publish a home address. Default pickup copy: `Recogida local · el punto y horario se acuerdan por WhatsApp`.

### Category

`id`, `name`, `slug`, `description`, `icon`, `active`, `order`, timestamps.

### Product

`id`, `name`, `slug`, `shortDescription`, `description`, `price`, `compareAtPrice`, `categoryId`, `status` (`available`, `made_to_order`, `sold_out`), `stockQuantity`, `leadTime`, `featured`, `active`, `customizable`, `colors[]`, `sizes[]`, `materials`, `images[]`, timestamps.

### Inquiry

`id`, `customerName`, `items[]`, `note`, `estimatedTotal`, `currency`, `privacyAcceptedAt`, `privacyVersion`, `status` (`whatsapp_opened`, `contacted`, `confirmed`, `completed`, `archived`), timestamps. It is an inquiry/intention, never presented as a confirmed order. Guided customization keeps the requested free-form details in the note while product price and catalogue references remain server-authoritative.

### Private price history

Bounded records of actual product price changes: product ID/name, previous and
new price, currency and timestamp. It is only available to the authenticated
administrator and contains no visitor data.

## API

- `GET /api/health`
- `GET /api/store`
- `POST /api/inquiries`
- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/admin/bootstrap`
- `GET /api/admin/products/:id/price-history`
- `POST /api/admin/uploads` (`images`, max 5 safe raster images)
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `PUT /api/admin/settings`
- `PATCH /api/admin/inquiries/:id`
- `DELETE /api/admin/inquiries/:id`

## Security and persistence

- First-run setup creates the sole owner account; after that setup is locked. Production requires a one-use `SETUP_TOKEN`; tokenless development setup is restricted to a fully loopback request.
- Passwords use Node `crypto.scrypt` with a per-user salt.
- Sessions use random opaque tokens; only SHA-256 hashes are stored.
- Cookie is HttpOnly, SameSite=Lax and Secure in production.
- Mutations validate same-origin requests, JSON size, field lengths and enum values.
- Login/setup and inquiry routes are rate limited.
- Uploads allow JPEG, PNG and WebP only; maximum 6 MB each; file structures are checked, metadata is stripped and filenames are randomized.
- Data is persisted atomically to a JSON store beneath configurable `DATA_DIR`; production requires a persistent disk and a single writing Node instance.
- Public production origins must be explicit HTTPS URLs. All state-changing routes use same-origin validation.
- Inquiry retention is capped at 180 days and total stored inquiries are bounded. Explicit privacy acceptance is required before any inquiry is saved.

## Public experience

Animated product-first hero, active-section navigation, trust strip, one searchable/filterable catalogue, animated filter transitions, product quick-view with variants and quantity, inquiry bag, WhatsApp message composer, one five-step visual customizer, how-it-works, story, FAQ and footer. Product imagery must remain clear in both themes and the interface must preserve text contrast. Animations must not block interaction and must honor reduced-motion preferences. The valid WhatsApp destination is preconfigured; if it is removed or becomes invalid, the CTA must be disabled with a clear admin message. The server is authoritative for product prices, priced size options, availability and the final WhatsApp destination/message.

## Admin experience

Responsive login/first-run setup, aggregate dashboard insights, product CRUD and image upload, safe draft duplication, live product preview, private price history, category CRUD, inquiry status management, business/WhatsApp settings, preview-store link and logout. Empty/loading/error/success states are mandatory. Insights are derived from stored inquiries and never add public visitor tracking.

## Upgrade behavior

When an existing installation still contains the untouched catalogue bundled
with the prior release, startup migrates it to the new 20-product collection.
The owner account, settings and inquiries are preserved. A catalogue that has
been customized must never be overwritten automatically.

Schema 4 updates a bundled price only when its stored value still matches the
previous bundled price. Owner-edited prices and product names are never
overwritten. An empty pre-schema-4 WhatsApp setting is filled with
`+5219811681460`; a customized number is preserved.
