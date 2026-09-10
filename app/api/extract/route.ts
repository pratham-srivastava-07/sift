import { extractionRequestSchema } from "@/lib/extraction/contracts";
import { ExtractionError } from "@/lib/extraction/errors";
import { extractWebsite } from "@/lib/extraction/service";
import { websiteBoundary } from "@/lib/extraction/website";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "Send a JSON body with url and prompt." } }, { status: 400 });
  }

  const input = extractionRequestSchema.safeParse(body);
  if (!input.success) {
    return Response.json({
      error: {
        code: "INVALID_INPUT",
        message: "Provide an HTTP(S) URL and a nonempty extraction prompt.",
        issues: input.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    }, { status: 400 });
  }

  try {
    const result = await extractWebsite(input.data, websiteBoundary(input.data.url), request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: { code: "CANCELLED", message: "The extraction request was cancelled." } }, { status: 408 });
    }
    if (error instanceof ExtractionError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("Extraction request failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: { code: "EXTRACTION_FAILED", message: "Extraction failed. Check the server and browser configuration." } }, { status: 500 });
  }
}
