import { z } from "zod";

export const amazonTrackRequestSchema = z.object({
  productUrl: z.url({ protocol: /^https?$/ }),
  postalCode: z.string().regex(/^\d{5,6}$/, "Enter a 5-digit ZIP or 6-digit PIN code."),
}).strict();

export const amazonTrackResponseSchema = z.object({
  name: z.string(),
  price: z.string().nullable(),
  currency: z.string().nullable(),
  availability: z.enum(["available", "unavailable", "unknown"]),
  location: z.string(),
  postalCode: z.string(),
  timestamp: z.string().datetime(),
  imageUrl: z.url().nullable(),
  url: z.url(),
  overview: z.string().nullable(),
}).strict();

export type AmazonTrackRequest = z.infer<typeof amazonTrackRequestSchema>;
export type AmazonTrackResponse = z.infer<typeof amazonTrackResponseSchema>;
