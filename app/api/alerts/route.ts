import { z } from "zod";
import { requirePool } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  productUrl: z.url({ protocol: /^https?$/ }),
  postalCode: z.string().regex(/^\d{5,6}$/),
  kind: z.enum(["email", "webhook"]),
  destination: z.string().min(3).max(2048),
  thresholdPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
}).strict();

function validateDestination(kind: "email" | "webhook", value: string) {
  if (kind === "email") return z.email().safeParse(value).success ? null : "destination must be a valid email address.";
  return z.url().safeParse(value).success ? null : "destination must be a valid webhook URL.";
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a valid productUrl, postalCode, kind, destination, and thresholdPrice." }, { status: 400 });
  const invalidDestination = validateDestination(parsed.data.kind, parsed.data.destination);
  if (invalidDestination) return Response.json({ error: invalidDestination }, { status: 400 });
  try {
    const db = requirePool();
    const target = await db.query("SELECT t.id FROM tracking_targets t JOIN products p ON p.id=t.product_id WHERE p.canonical_url=$1 AND t.postal_code=$2", [parsed.data.productUrl, parsed.data.postalCode]);
    if (!target.rows[0]) return Response.json({ error: "Run a price check for this product and location before creating an alert." }, { status: 404 });
    const row = await db.query("INSERT INTO alert_subscriptions(target_id,kind,destination,threshold_price) VALUES($1,$2,$3,$4) RETURNING id,kind,destination,threshold_price,active,created_at", [target.rows[0].id, parsed.data.kind, parsed.data.destination, parsed.data.thresholdPrice ?? null]);
    return Response.json(row.rows[0], { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Alert storage is unavailable." }, { status: 503 }); }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productUrl = url.searchParams.get("productUrl");
  const postalCode = url.searchParams.get("postalCode");
  if (!productUrl || !postalCode) return Response.json({ error: "productUrl and postalCode are required." }, { status: 400 });
  try {
    const rows = await requirePool().query("SELECT a.id,a.kind,a.destination,a.threshold_price,a.active,a.created_at FROM alert_subscriptions a JOIN tracking_targets t ON t.id=a.target_id JOIN products p ON p.id=t.product_id WHERE p.canonical_url=$1 AND t.postal_code=$2 ORDER BY a.created_at DESC", [productUrl, postalCode]);
    return Response.json(rows.rows);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Alert storage is unavailable." }, { status: 503 }); }
}
