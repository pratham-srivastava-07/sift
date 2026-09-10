import assert from "node:assert/strict";
import test from "node:test";
import { createExtractionModel } from "../lib/extraction/model.ts";

function modelWithAnswers(answers) {
  const calls = [];
  const model = createExtractionModel("test-key", undefined, async (_url, options) => {
    calls.push({ body: JSON.parse(options.body), headers: new Headers(options.headers) });
    const answer = answers.shift();
    assert.ok(answer, "Unexpected extra model call");
    return Response.json({
      id: "test", object: "chat.completion", created: 0, model: "interfaze-beta",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(answer) } }],
    });
  });
  return { model, calls };
}

const plan = [{ name: "price", description: "Price of the requested product" }];

test("uses Interfaze structured output with its automatic router disabled", async () => {
  const { model, calls } = modelWithAnswers([{ fields: plan }]);
  assert.deepEqual(await model.plan("Give me the price"), plan);
  assert.equal(calls[0].headers.get("x-interfaze-bypass-moa"), "true");
  assert.equal(calls[0].body.response_format.type, "json_schema");
});

test("accepts a value supported by an exact page quote", async () => {
  const { model } = modelWithAnswers([{ price: { value: "$20", evidence: ["Price: $20"] } }, { price: true }]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Product\nPrice: $20", links: [] }, ["price"], plan, "Give me the price"), { price: "$20" });
});

test("does not accept invented evidence", async () => {
  const { model } = modelWithAnswers([{ price: { value: "$20", evidence: ["Price: $20"] } }]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Price unavailable", links: [] }, ["price"], plan, "Give me the price"), { price: null });
});

test("still rejects semantically unrelated offers even when their quotes exist", async () => {
  const { model } = modelWithAnswers([
    { price: { value: "$20", evidence: ["Accessory price: $20"] } },
    { price: false },
  ]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Phone unavailable. Accessory price: $20", links: [] }, ["price"], plan, "Get phone price"), { price: null });
});

test("continues to later content chunks to find missing information", async () => {
  const { model, calls } = modelWithAnswers([
    { price: { value: null, evidence: [] } },
    { price: { value: "$20", evidence: ["Price: $20"] } },
    { price: true },
  ]);
  const result = await model.extract({ url: "https://example.com", content: "x".repeat(12_001) + "\nPrice: $20", links: [] }, ["price"], plan, "Give me the price");
  assert.deepEqual(result, { price: "$20" });
  assert.equal(calls.length, 3);
});

test("rejects duplicate field plans", async () => {
  const { model } = modelWithAnswers([{ fields: [...plan, ...plan] }]);
  await assert.rejects(model.plan("Give me the price"), /duplicate/);
});

test("accepts separate exact evidence passages for a synthesized description", async () => {
  const fields = [{ name: "description", description: "Product description" }];
  const { model, calls } = modelWithAnswers([
    { description: { value: "A titanium phone with a long-lasting battery.", evidence: ["Titanium body", "Battery lasts 30 hours"] } },
    { description: true },
  ]);
  const result = await model.extract({ url: "https://example.com", content: "Titanium body\nOther section\nBattery lasts 30 hours", links: [] }, ["description"], fields, "Describe the product");
  assert.equal(result.description, "A titanium phone with a long-lasting battery.");
  assert.equal(calls.length, 2);
});

test("rejects a fabricated quote within an otherwise supported evidence array", async () => {
  const { model, calls } = modelWithAnswers([{ price: { value: "$20", evidence: ["Product", "Price: $20"] } }]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Product\nPrice unavailable", links: [] }, ["price"], plan, "Get price"), { price: null });
  assert.equal(calls.length, 1);
});

test("focused content stops extraction before unrelated full-page chunks", async () => {
  const { model, calls } = modelWithAnswers([
    { price: { value: "$20", evidence: ["Selected product: Phone", "Price: $20"] } },
    { price: true },
  ]);
  assert.deepEqual(await model.extract({ url: "https://example.com", focusedContent: "Selected product: Phone\nPrice: $20", content: "Navigation and reviews".repeat(2000), links: [] }, ["price"], plan, "Get price"), { price: "$20" });
  assert.equal(calls.length, 2);
  assert.ok(JSON.parse(calls[0].body.messages[1].content).content.includes("Selected product"));
});

test("focused content keeps full-page fallback available for missing fields", async () => {
  const { model } = modelWithAnswers([
    { price: { value: null, evidence: [] } },
    { price: { value: "$20", evidence: ["Price: $20"] } },
    { price: true },
  ]);
  assert.deepEqual(await model.extract({ url: "https://example.com", focusedContent: "Product", content: "Price: $20", links: [] }, ["price"], plan, "Get price"), { price: "$20" });
});

test("link ranking cannot turn invented indices into URLs", async () => {
  const { model } = modelWithAnswers([{ links: [{ index: 100, score: 1 }, { index: 0, score: 0.8 }] }]);
  assert.deepEqual(await model.rankLinks([{ url: "https://example.com/details", text: "Details" }], ["price"], plan, "Give me the price"), ["https://example.com/details"]);
});
