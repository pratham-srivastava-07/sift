import { requirePool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productUrl = url.searchParams.get("productUrl");
  const postalCode = url.searchParams.get("postalCode");
  if (!productUrl || !postalCode) return Response.json({ error: "productUrl and postalCode are required." }, { status: 400 });
  try {
    const rows = await requirePool().query("SELECT o.price,o.currency,o.availability,o.overview,o.observed_at AS timestamp,o.raw_url AS url FROM price_observations o JOIN tracking_targets t ON t.id=o.target_id JOIN products p ON p.id=t.product_id WHERE p.canonical_url=$1 AND t.postal_code=$2 ORDER BY o.observed_at DESC LIMIT 100", [productUrl, postalCode]);
    return Response.json(rows.rows, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "History storage is unavailable." }, { status: 503 }); }
}
