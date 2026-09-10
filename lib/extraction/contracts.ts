import { z } from "zod";

export const extractionRequestSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  prompt: z.string().trim().min(1, "Describe the information to extract."),
}).strict();

export const extractedFieldsSchema = z.record(z.string(), z.json());

export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;
export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

export function requestedFieldsSchema(fields: readonly string[]) {
  const requested = new Set(fields);

  return extractedFieldsSchema.superRefine((value, context) => {
    for (const field of requested) {
      if (!Object.hasOwn(value, field)) {
        context.addIssue({ code: "custom", message: `Missing requested field: ${field}` });
      }
    }
    for (const field of Object.keys(value)) {
      if (!requested.has(field)) {
        context.addIssue({ code: "custom", message: `Unexpected field: ${field}` });
      }
    }
  });
}
