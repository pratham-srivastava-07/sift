import { requestedFieldsSchema } from "./contracts.ts";
import type { ExtractedFields } from "./contracts.ts";

export const MAX_PAGES = 5;

export type RetrievedPage = {
  url: string;
  title?: string;
  heading?: string;
  content: string;
  links: { url: string; text: string }[];
};

export type ExtractionContext = {
  startUrl: string;
  initialTitle: string;
  initialHeading: string;
  knownFields: ExtractedFields;
};

// Browser retrieval owns redirect handling and enforcement of website scope.
// The model adapter ranks only links discovered by the browser.
export type CrawlDependencies = {
  retrieve: (url: string) => Promise<RetrievedPage>;
  extract: (
    page: RetrievedPage,
    missingFields: readonly string[],
    context: ExtractionContext,
  ) => Promise<unknown>;
  rankLinks: (
    links: RetrievedPage["links"],
    missingFields: readonly string[],
    context: ExtractionContext,
  ) => Promise<string[]>;
  isWithinWebsite: (url: string) => boolean;
};

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

export async function crawlForFields(
  startUrl: string,
  fields: readonly string[],
  dependencies: CrawlDependencies,
): Promise<ExtractedFields> {
  if (fields.length === 0 || new Set(fields).size !== fields.length) {
    throw new Error("Extraction requires a nonempty list of unique field names.");
  }

  const result: ExtractedFields = Object.fromEntries(fields.map((field) => [field, null]));
  const visited = new Set<string>();
  const candidates = new Map<string, { url: string; text: string }>();
  let nextUrl: string | undefined = canonicalUrl(startUrl);
  let pageCount = 0;
  const context: ExtractionContext = { startUrl, initialTitle: "", initialHeading: "", knownFields: {} };

  while (nextUrl && pageCount < MAX_PAGES) {
    if (!dependencies.isWithinWebsite(nextUrl)) {
      throw new Error("The selected page is outside the permitted website.");
    }
    visited.add(nextUrl);
    pageCount += 1;
    candidates.delete(nextUrl);

    const page = await dependencies.retrieve(nextUrl);
    if (!dependencies.isWithinWebsite(page.url)) {
      throw new Error("The retrieved page is outside the permitted website.");
    }
    visited.add(canonicalUrl(page.url));
    candidates.delete(canonicalUrl(page.url));
    if (pageCount === 1) {
      context.initialTitle = page.title ?? "";
      context.initialHeading = page.heading ?? "";
    }
    context.knownFields = { ...result };

    const missing = fields.filter((field) => result[field] === null);
    const extracted = requestedFieldsSchema(missing).parse(
      await dependencies.extract(page, missing, context),
    );
    for (const field of missing) result[field] = extracted[field];
    context.knownFields = { ...result };

    const remaining = fields.filter((field) => result[field] === null);
    if (remaining.length === 0 || pageCount === MAX_PAGES) break;

    for (const link of page.links) {
      let url: string;
      try {
        url = canonicalUrl(link.url);
      } catch {
        continue;
      }
      if (!visited.has(url) && dependencies.isWithinWebsite(url)) {
        candidates.set(url, { ...link, url });
      }
    }
    if (candidates.size === 0) break;

    const ranked = await dependencies.rankLinks([...candidates.values()], remaining, context);
    // A model cannot introduce a URL that was not actually discovered.
    nextUrl = ranked.find((url) => candidates.has(url) && !visited.has(url));
  }

  return requestedFieldsSchema(fields).parse(result);
}
