// Keep every part of the page, with overlap for values split across chunks.
export function contentChunks(content: string, size = 12_000, overlap = 400): string[] {
  if (size <= overlap || overlap < 0) throw new Error("Invalid chunk sizes.");
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + size, content.length);
    if (end < content.length) {
      const lineEnd = content.lastIndexOf("\n", end);
      if (lineEnd > start + size / 2) end = lineEnd;
    }
    chunks.push(content.slice(start, end));
    if (end === content.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function normalizeEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
