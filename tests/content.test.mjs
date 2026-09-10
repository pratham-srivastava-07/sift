import assert from "node:assert/strict";
import test from "node:test";
import { contentChunks } from "../lib/extraction/content.ts";

test("keeps short content intact", () => {
  assert.deepEqual(contentChunks("Title\nPrice: $10"), ["Title\nPrice: $10"]);
});

test("chunks cover every character, including the end of long pages", () => {
  const input = Array.from({ length: 4000 }, (_, i) => `line ${i}: product details\n`).join("");
  const chunks = contentChunks(input);
  assert.ok(chunks.length > 1);
  let reconstructed = chunks[0];
  for (const chunk of chunks.slice(1)) reconstructed += chunk.slice(400);
  assert.equal(reconstructed, input);
  assert.ok(chunks.every((chunk) => chunk.length <= 12_000));
});

test("invalid overlap cannot cause an infinite loop", () => {
  assert.throws(() => contentChunks("test", 10, 10));
});
