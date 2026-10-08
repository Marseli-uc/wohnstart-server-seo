# WohnStart – Payment Backend (Stripe Checkout)

A real, working payment system for **WohnStart Komplett** — the single one-time
package that replaced STANDARD / PLUS / PREMIUM — built on Stripe Checkout.
See section "WohnStart Komplett" below for the customer features. This is a self-hosted Node.js project — it is **not** the
Claude-hosted preview link, because a real payment backend needs a real server with
secret keys and a public webhook endpoint, which a sandboxed preview page cannot provide.

## What's real here vs. what you still need to do

**Already implemented and correct:**
- Real Stripe Checkout Sessions (`server/routes/checkout.js`)
- Server-side price resolution — the frontend only ever sends a package ID, never a price
- Signature-verified Stripe webhook (`server/routes/webhook.js`)
- Idempotent order storage (duplicate webhook deliveries update the same row, not a new one)
- An orders database with the exact fields you asked for (`server/db.js`)
- Success page that polls a backend endpoint and only shows "paid" once the webhook
  has actually confirmed it — never based on the redirect alone (`public/success.html`)
- Cancel page with no ambiguity about payment status (`public/cancel.html`)
- A minimal "my documents" access page gated on verified payment (`public/account.html`)

**You still need to do, because only you can:**
- Create a real Stripe account (or use your existing one) and one Product/Price: WohnStart Komplett
- Deploy this project somewhere with a public URL (Stripe's webhook needs to reach it)
- Set the environment variables with your real Stripe keys and Price IDs
- Actually test it against Stripe's test mode — I cannot do this from within this chat,
  since this sandbox has no network path to Stripe's API and isn't a deployable, publicly
  reachable server.

---

## Project structure

```
wohnstart-server/
├─ server/
│  ├─ index.js              Express app entry point
│  ├─ db.js                 SQLite schema + idempotent order upsert
│  ├─ entitlement.js        WohnStart Komplett access check (paid order via ws_order cookie)
│  ├─ config/
│  │  └─ packages.js        SINGLE SOURCE OF TRUTH for package names/features/env-var names
│  └─ routes/
│     ├─ checkout.js        POST /api/create-checkout-session
│     ├─ webhook.js         POST /webhook  (Stripe signature verification)
│     ├─ orders.js          GET  /api/order-status
│     ├─ ai-check.js        GET  /api/ai-check/status, POST /api/ai-check/analyze
│     ├─ komplett.js        GET  /api/entitlement, POST /api/documents/generate
│     └─ downloads.js       GET  /api/download/:document (blank templates)
│  └─ services/
│     ├─ ai-document-check.js  KI-Dokumenten-Check: prompt, schema, date rules
│     └─ document-generator.js PDF generation (pdf-lib): Mieterselbstauskunft, Anschreiben, Deckblatt
├─ public/
│  ├─ index.html            Main site (your existing WohnStart frontend, checkout wired in)
│  ├─ success.html          "Zahlung erfolgreich" — verifies via the backend before showing anything
│  ├─ cancel.html           "Zahlung abgebrochen"
│  ├─ account.html          Minimal gated access page for the purchased package
│  ├─ js/ki-check.js        KI-Dokumenten-Check frontend (#ki-check route)
│  ├─ js/komplett.js        Mein WohnStart, Meine Angaben, Dokumente erstellen, Meine Unterlagen
│  ├─ css/ki-check.css      KI-Dokumenten-Check styles (uses the site's tokens)
│  └─ css/komplett.css      WohnStart Komplett styles (uses the site's tokens)
├─ .env.example             Copy to .env and fill in
├─ package.json
└─ README.md                You are here
```

---

## 1. Local setup (test mode)

### Install dependencies

```bash
cd wohnstart-server
npm install
```

### Create your Stripe test Product & Price

1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/test/products) (make sure
   you're in **Test mode** — toggle top-right).
2. Create ONE Product: `WohnStart Komplett` with a **one-time** price (e.g. €29.99).
3. Copy its **Price ID** (starts with `price_...`, not the Product ID which starts
   with `prod_...`) into `STRIPE_PRICE_KOMPLETT`.

The homepage and pricing page read the amount from this Stripe Price automatically
(`GET /api/packages`), so you only ever set the price in Stripe. `displayPrice` in
`server/config/packages.js` is only shown if Stripe can't be reached.

### Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
STRIPE_SECRET_KEY=sk_test_...          # Dashboard → Developers → API keys (test mode)
STRIPE_WEBHOOK_SECRET=                 # fill in after the next step
STRIPE_PRICE_KOMPLETT=price_...
BASE_URL=http://localhost:3000
PORT=3000
```

### Forward webhooks to your machine (local dev)

Stripe needs to reach your webhook endpoint. Locally, use the
[Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:3000/webhook
```

This prints a webhook signing secret like `whsec_...` — put that in `STRIPE_WEBHOOK_SECRET`
in your `.env`. Leave this command running in its own terminal while you test.

### Start the server

```bash
npm run dev
```

Visit `http://localhost:3000`.

### Test the full flow

1. Go to the WohnStart Komplett section (homepage or `/#kurs`), click "WohnStart Komplett kaufen".
2. You're redirected to a real Stripe-hosted Checkout page.
3. Use a [Stripe test card](https://stripe.com/docs/testing#cards):
   - **Success:** `4242 4242 4242 4242`, any future expiry, any CVC, any postcode
   - **Declined:** `4000 0000 0000 0002`
   - **Requires authentication (3D Secure):** `4000 0025 0000 3155`
4. On success, you land on `/success.html`. Watch the terminal running `stripe listen` —
   you should see the webhook fire and your server log receive it.
5. Check `server/data.sqlite` (or query it) to confirm a row was written to `orders`
   with `payment_status = 'paid'`.
6. Click "Mein WohnStart öffnen" — the success page has already unlocked WohnStart Komplett
   in this browser (`/api/entitlement` now returns `komplett: true`). "Zu meinen Dokumenten"
   (`account.html`) does the same and also works on other devices.

### Test cancellation

Click a CTA, then click the back arrow / "←" on the Stripe Checkout page instead of
paying. You should land on `/cancel.html` with no order created.

### Test duplicate webhook delivery (idempotency)

In the Stripe Dashboard (or CLI), find the `checkout.session.completed` event for your
test purchase and resend it. The `orders` table should still have exactly one row for
that session — `upsertOrderFromSession` updates in place rather than duplicating.

### Test a failed async payment

Some payment methods (e.g. certain bank debits) confirm asynchronously. You can simulate
this with Stripe's test clocks or by using a test payment method documented under
["Testing asynchronous payments"](https://stripe.com/docs/testing) in Stripe's docs — the
webhook handler already listens for `checkout.session.async_payment_failed` and
`checkout.session.async_payment_succeeded`.

---

## 2. Going to production

1. **Create live Products/Prices.** In the Stripe Dashboard, switch off Test mode and
   repeat the product/price creation above with real prices. Copy the new (live) Price IDs.
2. **Deploy this project** to a host with a persistent public URL — e.g. Render, Railway,
   Fly.io, or your own VPS. (Note: if you deploy to a platform with an ephemeral filesystem,
   migrate `server/db.js` from SQLite to a hosted database first — see the comment at the
   top of that file.)
3. **Set `BASE_URL`** to your real domain (e.g. `https://wohnstart.de`), no trailing slash.
4. **Add a webhook endpoint** in the Stripe Dashboard: Developers → Webhooks → Add endpoint.
   - URL: `https://your-domain.com/webhook`
   - Events to send: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`
5. **Copy the new webhook's signing secret** into `STRIPE_WEBHOOK_SECRET` on your production
   server's environment (not in a file committed to git).
6. **Switch `STRIPE_SECRET_KEY`** to your live secret key (`sk_live_...`).
7. **Update `STRIPE_PRICE_KOMPLETT`** to the live Price ID from step 1.
8. **Verify end-to-end** with a real low-value purchase (or Stripe's live-mode test tools,
   where available) before announcing it publicly.

---

## Security notes (what's already handled, and what's on you)

- The Stripe **secret key never appears in any frontend file** — only in `server/`, read
  from `process.env`.
- The frontend **only ever sends a package ID** (`"komplett"`) — never a price or
  amount. Only packages with `purchasable: true` can be bought. `server/routes/checkout.js` is the only place that resolves a
  package ID to an actual Stripe Price ID.
- The webhook **verifies Stripe's signature** (`stripe.webhooks.constructEvent`) before
  trusting anything in the payload, and rejects anything that doesn't verify.
- **Access is only ever granted from the webhook-written database row** — `success.html`
  and `account.html` both call `/api/order-status`, which reads only from the database.
  Reaching the success URL by itself (e.g. guessing it, or a payment that later fails)
  never unlocks anything.
- **Duplicate webhook deliveries are safe** — the `orders` table has a `UNIQUE` constraint
  on `stripe_checkout_session_id`, and `upsertOrderFromSession` updates instead of inserting
  a duplicate.
- Card numbers, CVCs, and other sensitive payment data **never touch this server at all** —
  Stripe Checkout is hosted entirely on Stripe's domain.
- `/api/order-status` currently treats the (unguessable) Checkout Session ID as the access
  token, which is reasonable for this MVP without user accounts. **Before you add user
  accounts**, tighten this further by also checking that the logged-in user owns the order.
- This project has no rate limiting or logging/alerting set up — add these before
  high-traffic production use.

---

## Wiring in the actual downloadable documents

Nothing here fakes a download link. Right now, `account.html` shows the purchased
package's feature list and a placeholder note. When you have real files (PDFs, .docx
templates, etc.) ready:

1. Store them somewhere access-controlled (private S3 bucket, or similar — not a public
   folder in `public/`, or anyone with the URL could download them for free).
2. Add a route, e.g. `GET /api/documents?session_id=...`, that re-checks
   `getOrderBySessionId` the same way `orders.js` does, and if paid, generates a
   short-lived signed URL (or streams the file) for that package's documents.
3. Update `account.html` to call that route and render real download buttons.

This keeps the same "never trust the client, only the verified order" pattern used
everywhere else in this project.

---

## KI-Dokumenten-Check

Page: `/#ki-check` (in the "Mehr" menu). Flow: PDF hochladen → Dokument prüfen →
Analyse läuft → Ergebnis. Open to all visitors; no login, link or code needed.

- `public/js/ki-check.js`, `public/css/ki-check.css`: upload UI and result display
- `server/routes/ai-check.js`: `GET /api/ai-check/status`, `POST /api/ai-check/analyze`
- `server/services/ai-document-check.js`: prompt, JSON schema, validation, date rules

### Setup

1. `npm install` (needs `multer`)
2. `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. **Your Anthropic account needs API credit** (console.anthropic.com → Plans &
   Billing). Without credit every analysis fails; visitors see "nicht verfügbar"
   and the server log says exactly what's wrong.

Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`),
`AI_CHECK_DAILY_LIMIT` (analyses per IP per 24 h, default 20),
`AI_CHECK_MAX_PARALLEL` (default 4).

### What it checks

Document type, readability, missing information, missing pages,
expiry/age (computed in code from dates the AI reads; never guessed), obvious
inconsistencies, and suitability for a German apartment application. Each
problem comes with its own recommendation. Anything the AI can't verify is shown
as "Nicht eindeutig erkennbar." The AI is instructed never to call a document
officially/legally valid or guaranteed to be accepted.

### Privacy & safety

- PDF only, verified by file bytes; max 15 MB / 30 pages.
- The PDF is held in memory for one request, sent to Anthropic, and never
  written to disk or the database. Results are not stored.
- The API key is only read on the server.
- ID/passport numbers, IBANs etc. are excluded from results (prompt + server filter).
- Instructions inside a PDF are ignored; all output is HTML-escaped.

### Before going live

- Behind a reverse proxy (Render, Railway, Nginx …) add `app.set("trust proxy", 1)`
  in `server/index.js`, otherwise all visitors share one IP for the rate limit.
- Update your Datenschutzerklärung (documents go to Anthropic) and sign a data
  processing agreement (AVV/DPA) with Anthropic.
- Set a monthly spending limit in the Anthropic console, since the check is open to everyone.


---

## WohnStart Komplett

One one-time package (`komplett` in `server/config/packages.js`). Pages (in the "Mein
WohnStart" area, linked in the header and "Mehr" menu). The "Mehr" menu starts with
**KI** (`/#ki-check`) and **Meine Angaben** (`/#angaben`); every "Jetzt starten" button
opens Meine Angaben. The former pages "Dokumente" (`/#dokumente`) and
"Bewerbungs-Checkliste" (`/#dokumente-check`) were removed; old links to them show the
homepage. The "Anlagen" list in Anschreiben/Deckblatt comes from Meine Unterlagen.

**Info page "Neu in Deutschland – noch keine SCHUFA?"** (`/#neu-in-deutschland`, in the
"Mehr" menu instead of "Dokumente erstellen"; the PDF tool stays reachable via the
Mein WohnStart tabs). Markup in `public/index.html`, styles in
`public/css/neu-in-deutschland.css`. Title and meta description are set per route
(`ROUTE_META` in the inline script).

| Route | What it does | Enforced by |
|---|---|---|
| `/#mein-wohnstart` | Overview | — |
| `/#angaben` | **Meine Angaben**: enter personal data once (auto-saved) | — |
| `/#dokument-erstellen` | Meine Angaben → Dokument auswählen → automatisch ausfüllen → Vorschau → PDF erstellen | **server** (402 without purchase) |
| `/#unterlagen` | **Meine Unterlagen**: folders Identität / Einkommen / Bonität / Weitere; upload, view, edit, remove, "Mit KI prüfen" | UI |
| `/#ki-check` | KI-Dokumenten-Check (unchanged): 2 free, then the package allowance | **server** |

### Access
Unlocked only by a webhook-confirmed paid order. The browser is linked to it by the
existing httpOnly `ws_order` cookie, set when `success.html` / `account.html` confirm the
payment. On another device, open the "Zu meinen Dokumenten" link once.

**Existing customers:** STANDARD/PLUS/PREMIUM can't be bought anymore but stay in the
config; their orders keep working and get all Komplett features (`grantsKomplett: true`)
plus their original AI allowance.

### AI allowance
2 free checks per visitor, then `aiChecks: 50` for WohnStart Komplett (change in
`server/config/packages.js`). Counted server-side; failed analyses are refunded.

### Documents (templates, not official forms)
`server/services/document-generator.js` (pdf-lib, pure JS — no native build):
- Mieterselbstauskunft — mirrors `private/documents/mieterselbstauskunft.pdf` (no questions
  on origin, religion, health, family planning); footer marks it as a template.
- Bewerbungsanschreiben — text pre-written in the browser from the user's data, editable.
- Bewerbungsmappe-Deckblatt — contact data, key facts, list of included documents.

Blank templates (`private/documents/*.pdf`) can be downloaded via `/api/download/...`
with the session id or the `ws_order` cookie.

**PDF design.** All PDFs share one design system (the `Layout` class in
`server/services/document-generator.js`): WohnStart header with document name, uppercase
section bands, boxed form fields, footer "WohnStart · Professionelle Unterstützung bei der
Wohnungssuche" and "Seite x von y" on multi-page documents. The two static downloads are
generated from the same code — after changing the design, rebuild them with
`node scripts/build-static-pdfs.js` (previous versions are kept in `private/documents/archiv/`).

### Where personal data lives
"Meine Angaben" (localStorage) and "Meine Unterlagen" (IndexedDB) stay in the customer's
browser on that device — not on your server. When a PDF is created, the data is sent once to
`/api/documents/generate`, turned into the PDF and not stored. A file sent to the KI-Check
goes to Anthropic only after the user clicks "Dokument prüfen". Mention this in your
Datenschutzerklärung.

---

# Security notes (from the security audit)

## New environment variables (all optional, safe defaults)

| Variable | When to set it |
|---|---|
| `TRUST_PROXY=1` | **Set this in production.** Required behind any reverse proxy / PaaS (Render, Railway, Fly, nginx, Cloudflare). Without it every visitor looks like the same IP to the rate limiters, and cookies are not marked `Secure`. |
| `NODE_ENV=production` | **Set this in production.** |
| `FORCE_SECURE_COOKIES=true` | Force the `Secure` cookie flag on HTTPS-only sites. |
| `CSP_REPORT_ONLY=true` | Test a stricter Content-Security-Policy without enforcing it. |
| `DISABLE_CSP=true` | Emergency switch if the CSP ever breaks a page. |

## What is protected, and how

* **Payments** – order status is written *only* by the signature-verified Stripe webhook. A forged webhook is rejected with 400 and creates nothing (covered by tests).
* **Paid PDFs** – stored in `private/`, outside the static root. Every download re-checks the database for a *paid* order; the document id is matched against a fixed allow-list, so no path can be guessed or traversed.
* **Identifiers** – Stripe session ids must match `cs_(test|live)_…` before any database lookup. All SQL is parameterised.
* **Object lookups** – user-supplied keys go through `security.lookup()` (own properties only), so `constructor` / `__proto__` cannot slip past a guard.
* **Errors** – a global handler returns a short German message; stack traces and filesystem paths stay in the server log.
* **Rate limits** – checkout, downloads, order status, AI checks and PDF generation are limited per IP. The **Stripe webhook is deliberately not limited** so Stripe's retries always get through.
* **Headers** – Helmet: CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy; `X-Powered-By` removed.

## Known limitations

* The CSP keeps `'unsafe-inline'` / `'unsafe-eval'` because the pages use inline `onclick=` handlers, inline `<script>`/`<style>` and the Tailwind Play CDN. It restricts *origins* but is not full XSS protection. To tighten: move inline handlers to `addEventListener`, move inline scripts to files, pre-build Tailwind, then drop those two keywords (test with `CSP_REPORT_ONLY=true`).
* Rate limiting is **in-memory, per process**. Running several instances means several independent limits — move to Redis or your proxy's rate limiting if you scale out.
* Anyone holding a Stripe Checkout Session ID can read that order's status (including the e-mail) and download its PDFs. That is the existing design; the ID is unguessable and now rate limited. Real user accounts would be the next step.
* `server/data.sqlite` holds customer orders. Back it up securely and never commit or share it.

## Run the tests

```
npm test
```
