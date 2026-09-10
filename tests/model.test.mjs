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
  const { model } = modelWithAnswers([{ price: { value: "$20", evidence: "Price: $20" } }, { price: true }]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Product\nPrice: $20", links: [] }, ["price"], plan, "Give me the price"), { price: "$20" });
});

test("does not accept invented evidence", async () => {
  const { model } = modelWithAnswers([{ price: { value: "$20", evidence: "Price: $20" } }, { price: false }]);
  assert.deepEqual(await model.extract({ url: "https://example.com", content: "Price unavailable", links: [] }, ["price"], plan, "Give me the price"), { price: null });
});

test("continues to later content chunks to find missing information", async () => {
  const { model, calls } = modelWithAnswers([
    { price: { value: null, evidence: null } },
    { price: { value: "$20", evidence: "Price: $20" } },
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

test("link ranking cannot turn invented indices into URLs", async () => {
  const { model } = modelWithAnswers([{ links: [{ index: 100, score: 1 }, { index: 0, score: 0.8 }] }]);
  assert.deepEqual(await model.rankLinks([{ url: "https://example.com/details", text: "Details" }], ["price"], plan, "Give me the price"), ["https://example.com/details"]);
});
