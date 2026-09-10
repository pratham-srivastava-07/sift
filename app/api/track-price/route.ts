import { amazonTrackRequestSchema } from "@/lib/amazon/contracts";
import { trackAmazon } from "@/lib/amazon/service";
import { ExtractionError } from "@/lib/extraction/errors";
import { saveObservation } from "@/lib/price-store";
import { sendAlerts } from "@/lib/alerts";

const buckets = new Map<string, { count: number; reset: number }>();

export const runtime = "nodejs";

export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(); const bucket = buckets.get(address);
  if (!bucket || bucket.reset <= now) buckets.set(address, { count: 1, reset: now + 60_000 });
  else if (++bucket.count > 10) return Response.json({ error: { code: "RATE_LIMITED", message: "Too many checks. Try again in a minute." } }, { status: 429, headers: { "Retry-After": "60" } });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "Send productUrl and postalCode as JSON." } }, { status: 400 });
  }
  const parsed = amazonTrackRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: { code: "INVALID_INPUT", message: "Provide an Amazon URL and a 5-digit ZIP or 6-digit PIN code." } }, { status: 400 });
  try { const result = await trackAmazon(parsed.data, request.signal); if (process.env.DATABASE_URL) { const subscriptions = await saveObservation(result); await sendAlerts(subscriptions, result); } return Response.json(result, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof ExtractionError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return Response.json({ error: { code: "TRACKING_FAILED", message: "Amazon price lookup failed." } }, { status: 500 });
  }
}
