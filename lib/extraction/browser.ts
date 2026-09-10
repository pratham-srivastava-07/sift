import puppeteer, { TimeoutError } from "puppeteer";
import type { HTTPRequest } from "puppeteer";
import { ExtractionError } from "./errors.ts";
import type { RetrievedPage } from "./crawl.ts";

export type BrowserBoundary = {
  isWithinWebsite: (url: string) => boolean;
  assertDestination: (url: string) => Promise<void>;
};

export async function createPageRetriever(boundary: BrowserBoundary, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const browser = await puppeteer.launch({ headless: true });
  const abort = () => { void browser.close().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    signal.removeEventListener("abort", abort);
    await browser.close();
    signal.throwIfAborted();
  }

  return {
    async retrieve(url: string): Promise<RetrievedPage> {
      signal?.throwIfAborted();
      await boundary.assertDestination(url);
      const page = await browser.newPage();
      let boundaryError: unknown;
      try {
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        const intercept = async (request: HTTPRequest) => {
          try {
            const isMainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
            if (isMainNavigation && !boundary.isWithinWebsite(request.url())) {
              throw new ExtractionError("OUTSIDE_WEBSITE", "A page redirected outside the permitted website.", 422);
            }
            // Embedded frames would otherwise retrieve extra documents outside the crawl budget.
            if (["image", "media", "font", "other"].includes(request.resourceType()) ||
                (request.isNavigationRequest() && !isMainNavigation)) {
              await request.abort();
              return;
            }
            await boundary.assertDestination(request.url());
            if (!request.isInterceptResolutionHandled()) await request.continue();
          } catch (error) {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) boundaryError = error;
            if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => undefined);
          }
        };
        page.on("request", (request) => { void intercept(request); });
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        if (boundaryError) throw boundaryError;
        if (!response || !response.ok()) {
          throw new ExtractionError("PAGE_FETCH_FAILED", `The website returned ${response?.status() ?? "no response"}.`, 502);
        }
        if (!(response.headers()["content-type"] ?? "").includes("text/html")) {
          throw new ExtractionError("UNSUPPORTED_CONTENT", "The selected URL did not return an HTML page.", 422);
        }
        // Give client-rendered content time to settle, without requiring tracking requests to stop.
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch((error) => {
          if (!(error instanceof TimeoutError)) throw error;
        });
        if (boundaryError) throw boundaryError;
        if (!boundary.isWithinWebsite(page.url())) {
          throw new ExtractionError("OUTSIDE_WEBSITE", "The page navigated outside the permitted website.", 422);
        }
        return await page.evaluate(() => {
          const metadata = [...document.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[property^="product:"]')]
            .map((element) => `${element.getAttribute("name") ?? element.getAttribute("property")}: ${element.getAttribute("content")}`);
          const structured = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((element) => element.textContent ?? "");
          const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
            .map((anchor) => ({ url: anchor.href, text: (anchor.innerText || anchor.getAttribute("aria-label") || anchor.title).replace(/\s+/g, " ").trim() }));
          const text = document.body?.innerText ?? "";
          const content = [
            `Title: ${document.title}`,
            ...metadata,
            "Rendered page text:", text,
            "Structured page data:", ...structured,
          ].join("\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
          return { url: location.href, title: document.title, heading: document.querySelector("h1")?.innerText.trim() ?? "", content, links };
        });
      } catch (error) {
        if (boundaryError) throw boundaryError;
        if (error instanceof ExtractionError || signal?.aborted) throw error;
        throw new ExtractionError("PAGE_FETCH_FAILED", "The website could not be loaded. It may be unavailable or blocking automated access.", 502, { cause: error });
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    async close() {
      signal?.removeEventListener("abort", abort);
      await browser.close();
    },
  };
}
