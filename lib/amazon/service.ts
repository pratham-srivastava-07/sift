import puppeteer from "puppeteer";
import { amazonTrackRequestSchema, amazonTrackResponseSchema } from "./contracts.ts";
import { ExtractionError } from "../extraction/errors.ts";

function isAmazonHost(hostname: string) {
  return hostname === "amazon.com" || hostname.endsWith(".amazon.com") || hostname === "amazon.in" || hostname.endsWith(".amazon.in");
}

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

export async function trackAmazon(input: unknown, signal?: AbortSignal) {
  const request = amazonTrackRequestSchema.parse(input);
  const product = new URL(request.productUrl);
  if (!isAmazonHost(product.hostname)) {
    throw new ExtractionError("UNSUPPORTED_MARKETPLACE", "Only Amazon.com and Amazon.in product pages are supported.", 422);
  }
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    signal?.throwIfAborted();
    await page.goto(request.productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined);
    const location = await page.$("#nav-global-location-popover-link");
    if (location) {
      await location.click();
      const postal = await page.waitForSelector("#GLUXZipUpdateInput, #GLUXPostalCode", { timeout: 10_000 }).catch(() => null);
      if (!postal) throw new ExtractionError("LOCATION_UNAVAILABLE", "Amazon did not expose its delivery-location control.", 502);
      await postal.click();
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await postal.type(request.postalCode);
      const apply = await page.$("#GLUXZipUpdate, #GLUXPostalUpdate");
      if (!apply) throw new ExtractionError("LOCATION_UNAVAILABLE", "Amazon did not expose its postal-code control.", 502);
      await apply.click();
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => undefined);
      const confirmation = await page.$("#GLUXZipConfirmationValue");
      const confirmed = clean(await confirmation?.evaluate((element) => element.textContent));
      const locationText = await page.evaluate(() => document.querySelector("#glow-ingress-line2")?.textContent || document.querySelector("#nav-global-location-data-modal-action")?.textContent || document.body.innerText.slice(0, 3000));
      if ((!confirmed || !confirmed.includes(request.postalCode)) && !locationText.includes(request.postalCode)) {
        throw new ExtractionError("LOCATION_NOT_APPLIED", "Amazon did not confirm the requested delivery location.", 422);
      }
      const done = await page.$('[name="glowDoneButton"], #GLUXConfirmClose');
      if (done) await done.click().catch(() => undefined);
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => undefined);
    }
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined);
    const result = await page.evaluate(() => {
      const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || null;
      const title = text("#productTitle") || document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || document.title;
      const price = text("#corePriceDisplay_desktop_feature_div .a-offscreen") || text("#priceblock_ourprice") || text("#priceblock_dealprice");
      const image = (document.querySelector("#landingImage") as HTMLImageElement | null)?.src || null;
      const unavailable = document.body.innerText.includes("cannot be shipped to your selected delivery location") || document.body.innerText.includes("Currently unavailable");
      const overview = [...document.querySelectorAll("#feature-bullets li span.a-list-item")].map((node) => node.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ") || text("#productDescription");
      return { title, price, image, unavailable, overview, url: window.location.href };
    });
    const currency = result.price?.match(/^[^\d\s]+/)?.[0] || null;
    return amazonTrackResponseSchema.parse({
      name: result.title,
      price: result.unavailable ? null : result.price,
      currency,
      availability: result.unavailable ? "unavailable" : result.price ? "available" : "unknown",
      location: product.hostname.endsWith(".in") || product.hostname === "amazon.in" ? "India" : "United States",
      postalCode: request.postalCode,
      timestamp: new Date().toISOString(),
      imageUrl: result.image,
      url: result.url,
      overview: result.overview,
    });
  } catch (error) {
    if (error instanceof ExtractionError || signal?.aborted) throw error;
    throw new ExtractionError("TRACKING_FAILED", "Amazon could not be read for this location.", 502, { cause: error });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
