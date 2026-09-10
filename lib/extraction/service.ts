import { extractionRequestSchema, requestedFieldsSchema } from "./contracts.ts";
import { crawlForFields } from "./crawl.ts";
import { createExtractionModel } from "./model.ts";
import { createPageRetriever } from "./browser.ts";
import type { BrowserBoundary } from "./browser.ts";
import { ExtractionError } from "./errors.ts";

export async function extractWebsite(input: unknown, boundary: BrowserBoundary, signal?: AbortSignal) {
  const request = extractionRequestSchema.parse(input);
  const apiKey = process.env.INTERFAZE_API_KEY;
  if (!apiKey) {
    throw new ExtractionError("MISSING_CONFIGURATION", "INTERFAZE_API_KEY is not configured on the server.", 503);
  }
  await boundary.assertDestination(request.url);
  if (!boundary.isWithinWebsite(request.url)) {
    throw new ExtractionError("OUTSIDE_WEBSITE", "The URL is outside the permitted website.", 422);
  }
  const model = createExtractionModel(apiKey, signal);
  const retriever = await createPageRetriever(boundary, signal);
  try {
    // Start the initial navigation alongside field planning, and reuse that page.
    // allSettled ensures failed planning cannot leave an unobserved navigation.
    const [planned, retrieved] = await Promise.allSettled([
      model.plan(request.prompt),
      retriever.retrieve(request.url),
    ]);
    if (planned.status === "rejected") throw planned.reason;
    if (retrieved.status === "rejected") throw retrieved.reason;
    const plan = planned.value;
    let firstPage = true;
    const fields = plan.map((field) => field.name);
    const result = await crawlForFields(request.url, fields, {
      retrieve: (url) => {
        if (firstPage) {
          firstPage = false;
          return Promise.resolve(retrieved.value);
        }
        return retriever.retrieve(url);
      },
      extract: (page, missing, context) => model.extract(page, missing, plan, request.prompt, context),
      rankLinks: (links, missing, context) => model.rankLinks(links, missing, plan, request.prompt, context),
      isWithinWebsite: boundary.isWithinWebsite,
    });
    return requestedFieldsSchema(fields).parse(result);
  } finally {
    await retriever.close();
  }
}
