import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createPageRetriever } from "../lib/extraction/browser.ts";

test("Puppeteer retrieves rendered text, metadata, structured data, and absolute links", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head><title>Test product</title>
      <meta name="description" content="A fixture product">
      <script type="application/ld+json">{"price":"20.00"}</script></head>
      <body><nav>Unrelated navigation</nav><main><div id="price"></div></main><a href="/details">Product details</a>
      <script>document.getElementById('price').textContent = 'Price: $20';</script>
      </body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  // A local fixture has an explicit test-only boundary, never the application policy.
  const retriever = await createPageRetriever({
    isWithinWebsite: (url) => new URL(url).origin === origin,
    assertDestination: async (url) => { assert.equal(new URL(url).origin, origin); },
  });
  try {
    const page = await retriever.retrieve(origin);
    assert.match(page.content, /Price: \$20/);
    assert.match(page.content, /A fixture product/);
    assert.match(page.content, /"price":"20.00"/);
    assert.match(page.focusedContent, /Price: \$20/);
    assert.match(page.focusedContent, /"price":"20.00"/);
    assert.doesNotMatch(page.focusedContent, /Unrelated navigation/);
    assert.match(page.content, /Unrelated navigation/);
    assert.deepEqual(page.links, [{ url: `${origin}/details`, text: "Product details" }]);
    assert.doesNotMatch(page.content, /getElementById/);
  } finally {
    await retriever.close();
    server.close();
    await once(server, "close");
  }
});
