import assert from "node:assert/strict";
import test from "node:test";
import { crawlForFields } from "../lib/extraction/crawl.ts";

const base = "https://example.com/";

function setup(extract) {
  const visits = [];
  return {
    visits,
    dependencies: {
      isWithinWebsite: (url) => new URL(url).origin === new URL(base).origin,
      retrieve: async (url) => {
        visits.push(url);
        return {
          url,
          content: "Page content",
          links: [
            { url: `${base}page-${visits.length}`, text: "Relevant details" },
            { url: `${base}#duplicate`, text: "Start" },
            { url: "https://outside.example/", text: "External" },
          ],
        };
      },
      extract,
      rankLinks: async (links) => links.map((link) => link.url),
    },
  };
}

test("stops on the first page, preserving zero and false as found values", async () => {
  const { visits, dependencies } = setup(async () => ({ price: 0, available: false }));
  assert.deepEqual(await crawlForFields(base, ["price", "available"], dependencies), {
    price: 0, available: false,
  });
  assert.equal(visits.length, 1);
});

test("visits at most five pages and returns null for unresolved fields", async () => {
  const { visits, dependencies } = setup(async () => ({ price: null }));
  assert.deepEqual(await crawlForFields(base, ["price"], dependencies), { price: null });
  assert.equal(visits.length, 5);
  assert.equal(new Set(visits).size, 5);
  assert.ok(visits.every((url) => url.startsWith(base)));
});

test("retains found fields and asks subsequent pages only for missing fields", async () => {
  let calls = 0;
  const { visits, dependencies } = setup(async (_page, missing) => {
    calls += 1;
    if (calls === 1) return { title: "Product", price: null };
    assert.deepEqual(missing, ["price"]);
    return { price: "$20" };
  });
  assert.deepEqual(await crawlForFields(base, ["title", "price"], dependencies), {
    title: "Product", price: "$20",
  });
  assert.equal(visits.length, 2);
});

test("stops when there are no more discovered relevant links", async () => {
  const { visits, dependencies } = setup(async () => ({ price: null }));
  dependencies.rankLinks = async () => [];
  assert.deepEqual(await crawlForFields(base, ["price"], dependencies), { price: null });
  assert.equal(visits.length, 1);
});

test("never visits links invented by the model", async () => {
  const { visits, dependencies } = setup(async () => ({ price: null }));
  dependencies.rankLinks = async () => [`${base}not-discovered`];
  await crawlForFields(base, ["price"], dependencies);
  assert.equal(visits.length, 1);
});

test("rejects model output that does not match requested fields", async () => {
  const { dependencies } = setup(async () => ({ title: "Unexpected" }));
  await assert.rejects(crawlForFields(base, ["price"], dependencies));
});

test("retrieval failure is not misrepresented as a missing field", async () => {
  const { dependencies } = setup(async () => ({ price: null }));
  dependencies.retrieve = async () => { throw new Error("Navigation failed"); };
  await assert.rejects(crawlForFields(base, ["price"], dependencies), /Navigation failed/);
});
