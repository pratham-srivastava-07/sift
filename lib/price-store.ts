import { requirePool } from "./db.ts";
import type { AmazonTrackResponse } from "./amazon/contracts.ts";
export async function saveObservation(result: AmazonTrackResponse) {
  const client = await requirePool().connect();
  try {
    await client.query("BEGIN");
    const product = await client.query("INSERT INTO products(marketplace,canonical_url,name,image_url) VALUES($1,$2,$3,$4) ON CONFLICT(canonical_url) DO UPDATE SET name=EXCLUDED.name,image_url=EXCLUDED.image_url,updated_at=now() RETURNING id", [result.location === "India" ? "amazon.in" : "amazon.com", result.url, result.name, result.imageUrl]);
    const target = await client.query("INSERT INTO tracking_targets(product_id,postal_code) VALUES($1,$2) ON CONFLICT(product_id,postal_code) DO UPDATE SET active=true RETURNING id", [product.rows[0].id, result.postalCode]);
    await client.query("INSERT INTO price_observations(target_id,price,currency,availability,overview,observed_at,raw_url) VALUES($1,$2,$3,$4,$5,$6,$7)", [target.rows[0].id, result.price, result.currency, result.availability, result.overview, result.timestamp, result.url]);
    const subscriptions = await client.query("SELECT kind,destination,threshold_price FROM alert_subscriptions WHERE target_id=$1 AND active=true", [target.rows[0].id]);
    await client.query("COMMIT");
    return subscriptions.rows;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
