import { requirePool } from "@/lib/db";
import { trackAmazon } from "@/lib/amazon/service";
import { sendAlerts } from "@/lib/alerts";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = requirePool();
  const targets = await db.query("SELECT t.id,p.canonical_url,t.postal_code FROM tracking_targets t JOIN products p ON p.id=t.product_id WHERE t.active=true");
  const results=[];
  for (const target of targets.rows) { try { const result=await trackAmazon({productUrl:target.canonical_url,postalCode:target.postal_code},request.signal); const subscriptions=await (await import("@/lib/price-store")).saveObservation(result); await sendAlerts(subscriptions,result); results.push({id:target.id,status:"ok"}); } catch (error) { results.push({id:target.id,status:"failed",message:error instanceof Error?error.message:"Unknown error"}); } }
  return Response.json({ results });
}
