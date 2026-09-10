# Extraction API

## Amazon price checker

The focused product flow is available at `POST /api/track-price`:

```json
{
  "productUrl": "https://www.amazon.com/dp/B0F9PKSJ17",
  "postalCode": "90210"
}
```

It returns `name`, `price`, `currency`, `availability`, `location`,
`postalCode`, `timestamp`, `imageUrl`, `url`, and `overview`. The server uses a
fresh Puppeteer browser, applies the postal code through Amazon's delivery
control, verifies the confirmation, then reads the selected product offer.
`price` is null when Amazon has no offer for that location. The general
`/api/extract` endpoint below remains available for arbitrary field prompts.

Run `npm run dev` with `INTERFAZE_API_KEY` set in `.env` or `.env.local`.
Puppeteer and its Chrome browser are installed by `npm install`.
No client-side key is required. The Sift UI uses this general endpoint.

## Request

`POST /api/extract` with `Content-Type: application/json`:

```json
{
  "url": "https://example.com/product",
  "prompt": "Give me the product title and price"
}
```

Successful responses contain only requested fields:

```json
{
  "title": "Example product",
  "price": null
}
```

Names are inferred from the prompt unless explicit names are supplied. Values can
be JSON strings, numbers, booleans, arrays, objects, or null. Errors use a non-2xx
status and an `error` object containing `code` and `message`. Input errors also
include field issues.

## Flow

1. Validate URL and prompt with Zod on the server.
2. Ask Interfaze to identify requested fields and their target entity while
   loading the initial page in parallel.
3. Retrieve the page with Puppeteer, including client-rendered text, metadata,
   JSON-LD, and anchor links. Scripts and styling are not sent to the model.
4. Prioritize metadata, structured data, and semantic main-content sections.
   Amazon product pages instead prioritize the selected product, offer, features,
   and specifications. Extract from overlapping 12,000-character chunks. The
   full rendered page remains a fallback for unresolved fields; later chunks are
   skipped when all fields have been found.
5. Require each non-null model value to have an array of exact supporting quotes in the
   supplied content. Review candidates for field meaning and target-entity
   relevance before accepting them. Validate the JSON value and requested field
   set with Zod. Product descriptions use a substantive paragraph from supported
   features and specifications rather than navigation or generic page labels.
   Separate passages use separate quotes, allowing synthesis without fabricating
   one continuous source passage. Prices retain their displayed currency.
6. If fields are missing, rank discovered same-hostname links by relevance and
   visit the next candidate. Preserve the starting URL, title, heading, and found
   fields as target context across chunks and followed pages. Stop at five pages total, when
   all fields are found, or when relevant discovered links are exhausted.
7. Return remaining fields as null and close the browser.

Interfaze uses `bypassMoA: true` to skip its automatic tool router. The service
does not call Interfaze scraping/search helpers. Responses reporting internal
tool activity are rejected. Model requests have a 60-second timeout and no
automatic retries; browser navigation has a 30-second timeout, followed by up to
five seconds for network activity to settle.

## Current limits

- The crawl compares exact hostnames; subdomains are not traversed. HTTP/HTTPS
  transitions on that hostname are allowed. Private and local network destinations
  are rejected. The general extraction endpoint has no user authentication; deploy
  it behind an application gateway if it is exposed publicly.
- Retrieval/model failures return an error rather than a successful partial
  result. Missing fields on successfully processed pages return null.
- No CAPTCHA solving, login workflow, infinite-scroll interaction, PDF parsing,
  or iframe extraction is implemented. Protected websites can block Puppeteer.
- Quotes establish source presence, not semantic correctness. Model mistakes
  remain possible even with the additional semantic review.
- Prices depend on the browser's delivery location and the selected offer.
  Amazon served the inspected product with India delivery and no available offer;
  prices from recommendation widgets must not be substituted. Delivery-location
  configuration remains pending the user's country/postal-code choice.
- Amazon may require a fresh residential ZIP/PIN, cookies, or anti-bot
  verification. The checker fails closed with `LOCATION_NOT_APPLIED` when it
  cannot prove the address was applied; it will not guess a price from another
  location or product.
- Run `npm run migrate` with `DATABASE_URL` before enabling scheduled checks or
  persistence. Set `CRON_SECRET` for `POST /api/run-scheduled`. Configure
  `SMTP_HOST`, `SMTP_PORT` (optional), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`
  (optional), and `ALERT_FROM` for email alerts. Webhook subscriptions are
  delivered as JSON POST requests.
- For local PostgreSQL, run `docker compose up -d postgres`, keep
  `DATABASE_URL=postgresql://postgres:your_password@localhost:5432/price_check`
  in `.env`, then run `npm run migrate`.
- After a successful Amazon check, create an alert with `POST /api/alerts` using
  `productUrl`, `postalCode`, `kind` (`email` or `webhook`), `destination`, and
  an optional numeric `thresholdPrice`. Read subscriptions with the same query
  parameters via `GET /api/alerts`. Read the last 100 observations with
  `GET /api/history?productUrl=...&postalCode=...`.
- General extraction requests process pages serially; large pages may require many
  model calls. Hosting must support Chrome and requests long enough for extraction.
