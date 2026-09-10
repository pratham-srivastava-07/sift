import { ExtractionError } from "./errors.ts";
import type { BrowserBoundary } from "./browser.ts";
import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a,b] = address.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

export function websiteBoundary(startUrl: string): BrowserBoundary {
  const start = new URL(startUrl);
  return {
    isWithinWebsite(value) {
      try {
        const url = new URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") &&
          url.hostname === start.hostname;
      } catch {
        return false;
      }
    },
    async assertDestination(value) {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ExtractionError("UNSUPPORTED_URL", "Only HTTP and HTTPS URLs are supported.", 422);
      }
      if (isPrivateIp(url.hostname)) throw new ExtractionError("PRIVATE_DESTINATION", "Private and local network destinations are not allowed.", 422);
      try {
        const addresses = await dns.lookup(url.hostname, { all: true });
        if (addresses.some(({ address }) => isPrivateIp(address))) throw new ExtractionError("PRIVATE_DESTINATION", "Private and local network destinations are not allowed.", 422);
      } catch (error) {
        if (error instanceof ExtractionError) throw error;
        throw new ExtractionError("DNS_FAILED", "The website hostname could not be resolved.", 422, { cause: error });
      }
    },
  };
}
