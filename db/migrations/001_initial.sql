CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, marketplace TEXT NOT NULL, canonical_url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, image_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tracking_targets (
  id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  postal_code TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, postal_code)
);
CREATE TABLE IF NOT EXISTS price_observations (
  id BIGSERIAL PRIMARY KEY, target_id BIGINT NOT NULL REFERENCES tracking_targets(id) ON DELETE CASCADE,
  price TEXT, currency TEXT, availability TEXT NOT NULL, overview TEXT, observed_at TIMESTAMPTZ NOT NULL,
  raw_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS price_observations_target_time ON price_observations(target_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id BIGSERIAL PRIMARY KEY, target_id BIGINT NOT NULL REFERENCES tracking_targets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('email','webhook')), destination TEXT NOT NULL, threshold_price TEXT,
  active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
