import nodemailer from "nodemailer";
import type { AmazonTrackResponse } from "./amazon/contracts.ts";
export async function sendAlerts(subscriptions: { kind: "email"|"webhook"; destination: string; threshold_price: string|null }[], result: AmazonTrackResponse) {
  const price = result.price ? Number(result.price.replace(/[^\d.]/g, "")) : null;
  await Promise.all(subscriptions.filter(s => price !== null && (!s.threshold_price || price <= Number(s.threshold_price))).map(async s => {
    const text = `${result.name}\nPrice: ${result.price}\nLocation: ${result.location} ${result.postalCode}\n${result.url}`;
    if (s.kind === "webhook") { const response = await fetch(s.destination, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "price_observed", product: result }) }); if (!response.ok) throw new Error(`Webhook returned ${response.status}`); return; }
    const required = ["SMTP_HOST","SMTP_USER","SMTP_PASS","ALERT_FROM"].every(k => process.env[k]);
    if (!required) throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS, and ALERT_FROM are required for email alerts.");
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transporter.sendMail({ from: process.env.ALERT_FROM, to: s.destination, subject: `Price update: ${result.name}`, text });
  }));
}
