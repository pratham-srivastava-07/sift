# Sift

Sift is a prompt-driven web extraction and price-monitoring application built with Next.js, Puppeteer, and structured AI output. Give it a public website URL and describe the fields you need; Sift retrieves the rendered page, reduces it to relevant content, and returns a validated JSON object containing only the requested fields.

The project also includes a focused Amazon workflow that applies a ZIP or PIN code before reading the selected offer, stores price history in PostgreSQL, and can send threshold-based email or webhook alerts.

## What it does

- Extracts arbitrary fields from public web pages using natural-language prompts.
- Handles client-rendered content through a real Chromium browser.
- Reduces model input with metadata, JSON-LD, semantic content selection, and prioritized chunks.
- Requires exact supporting quotes for non-null extracted values.
- Validates requests and model responses with Zod.
- Follows relevant same-host links when the starting page does not contain every requested field.
- Checks Amazon offers for a specific delivery location without substituting recommendation-widget prices.
- Optionally persists products, tracking targets, and price observations in PostgreSQL.
- Supports price-threshold notifications through SMTP email or JSON webhooks.

## How extraction works

```text
URL + prompt
     |
     v
Validate request and block unsafe destinations
     |
     v
Render the page with Puppeteer
     |
     v
Collect metadata, JSON-LD, semantic text, and links
     |
     v
Rank and chunk relevant content
     |
     v
Extract requested fields with evidence
     |
     v
Validate the exact output shape and return JSON
```

Large pages are processed in overlapping 12,000-character chunks. Extraction stops early once every requested field has acceptable evidence. If fields remain unresolved, Sift can visit relevant links on the same exact hostname, up to five pages total. Scripts and styling are never sent to the model.

## Technology

- Next.js 16 and React 19
- TypeScript
- Puppeteer and Chromium
- Interfaze for schema-constrained AI extraction
- Zod for boundary validation
- PostgreSQL 16 for optional persistence
- Nodemailer for SMTP alerts
- Node's built-in test runner

## Prerequisites

- Node.js 22 or newer (an even-numbered LTS release is recommended)
- npm
- An Interfaze API key
- Docker, or an existing PostgreSQL instance, if persistence and alerts are needed
- SMTP credentials if email alerts are needed

Puppeteer downloads a compatible browser during dependency installation.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` for the Next.js application:

   ```env
   INTERFAZE_API_KEY=your_interfaze_api_key
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

The general extraction UI requires only `INTERFAZE_API_KEY`. Database, scheduler, and SMTP configuration are optional unless you enable those features.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `INTERFAZE_API_KEY` | Yes | Authorizes structured AI extraction requests. |
| `DATABASE_URL` | For persistence | PostgreSQL connection string used by history, tracking, and alerts. |
| `CRON_SECRET` | For scheduled checks | Bearer token protecting the scheduled-check endpoint. |
| `SMTP_HOST` | For email alerts | SMTP server hostname, such as `smtp.gmail.com`. |
| `SMTP_PORT` | No | SMTP port; defaults to `587`. |
| `SMTP_USER` | For email alerts | SMTP account username. |
| `SMTP_PASS` | For email alerts | SMTP password, provider API key, or app password. |
| `SMTP_SECURE` | No | Set to `true` for implicit TLS, normally on port `465`; defaults to `false`. |
| `ALERT_FROM` | For email alerts | Verified sender address used in outgoing messages. |
| `POSTGRES_USER` | No | Docker Compose database user; defaults to `postgres`. |
| `POSTGRES_PASSWORD` | No | Docker Compose database password; defaults to `your_password`. |
| `POSTGRES_DB` | No | Docker Compose database name; defaults to `price_check`. |
| `POSTGRES_PORT` | No | Published local PostgreSQL port; defaults to `5432`. |

Environment files are ignored by Git. Do not expose server credentials through variables prefixed with `NEXT_PUBLIC_`.

### Optional PostgreSQL setup

Start the included PostgreSQL service:

```bash
docker compose up -d postgres
```

Create a root `.env` file for the migration script:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/price_check
```

Then apply the schema:

```bash
npm run migrate
```

When `DATABASE_URL` is configured, successful Amazon checks are stored automatically and matching alert subscriptions are evaluated.

### Optional email alerts

Example configuration using SMTP submission with STARTTLS:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password_or_api_key
SMTP_SECURE=false
ALERT_FROM="Sift Alerts <alerts@your-domain.com>"
```

The sender address must be allowed by your SMTP provider. For Gmail, use an app password rather than your normal account password. For transactional providers, verify the sender domain and use the SMTP credentials issued in their dashboard.

## API

### General extraction

`POST /api/extract`

```json
{
  "url": "https://example.com/product",
  "prompt": "Give me the product title, price, and description"
}
```

The response contains exactly the inferred fields:

```json
{
  "title": "Example product",
  "price": "$49.99",
  "description": "A concise product description."
}
```

Fields that cannot be supported by the retrieved content are returned as `null`.

### Amazon location-aware price check

`POST /api/track-price`

```json
{
  "productUrl": "https://www.amazon.com/dp/B0F9PKSJ17",
  "postalCode": "90210"
}
```

Example response:

```json
{
  "name": "Example product",
  "price": "$49.99",
  "currency": "USD",
  "availability": "available",
  "location": "Beverly Hills",
  "postalCode": "90210",
  "timestamp": "2026-09-12T10:30:00.000Z",
  "imageUrl": "https://example.com/product.jpg",
  "url": "https://www.amazon.com/dp/B0F9PKSJ17",
  "overview": "Product overview"
}
```

The endpoint applies and verifies the delivery location before reading the selected product offer. If no valid offer exists for that location, `price` is `null`. Requests are limited in memory to 10 checks per source address per minute; production deployments should enforce rate limits at a shared gateway or data store.

### Price history

`GET /api/history?productUrl=<encoded-url>&postalCode=90210`

Returns the latest 100 stored observations for a product and delivery location. PostgreSQL must be configured.

### Alert subscriptions

Create an email or webhook subscription with `POST /api/alerts`:

```json
{
  "productUrl": "https://www.amazon.com/dp/B0F9PKSJ17",
  "postalCode": "90210",
  "kind": "email",
  "destination": "engineer@example.com",
  "thresholdPrice": "45.00"
}
```

Run a price check for the same canonical product URL and postal code before creating its first subscription. Omit `thresholdPrice`, or set it to `null`, to notify on every observation with a numeric price.

List subscriptions with:

```text
GET /api/alerts?productUrl=<encoded-url>&postalCode=90210
```

Webhook subscriptions receive a JSON `POST` with a `price_observed` event and the product result.

### Scheduled checks

`POST /api/run-scheduled` checks every active tracking target serially:

```bash
curl -X POST http://localhost:3000/api/run-scheduled \
  -H "Authorization: Bearer $CRON_SECRET"
```

Configure an external scheduler to invoke this endpoint. It requires `DATABASE_URL` and rejects requests unless the bearer token exactly matches `CRON_SECRET`.

Error responses from the extraction endpoints use non-2xx status codes. General extraction errors have this shape:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Provide an HTTP(S) URL and a nonempty extraction prompt."
  }
}
```

See [docs/extraction-api.md](docs/extraction-api.md) for the detailed request flow and current behavior.

## Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the Next.js development server. |
| `npm run build` | Create a production build. |
| `npm start` | Start the production server after building. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run browser, content-selection, crawl, and model tests. |
| `npm run migrate` | Apply the PostgreSQL migration using `DATABASE_URL` from `.env`. |

## Trust and security boundaries

- Only HTTP and HTTPS targets are accepted.
- Private, loopback, and local-network destinations are rejected to reduce SSRF exposure.
- Extraction follows links only on the starting page's exact hostname.
- API keys and external calls stay on the server.
- Both untrusted request bodies and successful extraction output are validated.
- The general extraction endpoint has no built-in authentication; place it behind authentication and gateway-level rate limiting before exposing it publicly.
- Webhook destinations are user-controlled outbound requests. Restrict or validate them further in a multi-user or internet-facing deployment.

## Current limitations

- Protected sites may block browser automation or present CAPTCHAs.
- Login flows, CAPTCHA solving, PDF parsing, iframe extraction, and infinite-scroll interaction are not implemented.
- Supporting quotes establish that a value appears in supplied content, but do not eliminate all model interpretation errors.
- Exact-host crawling does not cross between a root domain and its subdomains.
- General extraction is serial and may require several model calls for large pages.
- Amazon availability and pricing vary by location, cookies, account state, and selected offer. The checker fails closed if it cannot verify that the requested location was applied.
- The scheduled runner processes targets serially and has no queue, retry policy, or distributed lock.
- In-memory rate limiting is per application instance and is not suitable as the only production control.

Use this software only on websites you are authorized to access, and respect applicable terms, robots policies, privacy requirements, and request-rate limits.

## Project structure

```text
app/                 Next.js UI and API routes
db/migrations/       PostgreSQL schema
docs/                Architecture, boundaries, and API notes
lib/extraction/      General retrieval and AI extraction pipeline
lib/amazon/          Amazon-specific contracts and browser workflow
lib/alerts.ts        Email and webhook delivery
lib/price-store.ts   Product, target, and observation persistence
scripts/             Database migration and diagnostics
tests/               Node test suites
```

## Further documentation

- [Extraction API and behavior](docs/extraction-api.md)
- [Architecture notes](docs/architecture.md)
- [Client/server boundaries](docs/boundaries.md)
