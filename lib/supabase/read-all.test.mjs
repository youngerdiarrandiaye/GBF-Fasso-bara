import { test } from "node:test";
import assert from "node:assert/strict";
import { readAll } from "./read-all.ts";

test("aggregates include rows beyond the default 1000-row limit", async () => {
  const source = Array.from({ length: 1205 }, (_, id) => ({ id, amount: 10 }));
  const { data } = await readAll({ range: async (from, to) => ({ data: source.slice(from, to + 1), error: null }) });
  assert.equal(data.length, 1205);
  assert.equal(data.reduce((total, row) => total + row.amount, 0), 12050);
  assert.equal(new Set(data.map((row) => row.id)).size, 1205);
});

test("a lower server limit does not truncate the result", async () => {
  const source = [1, 2, 3, 4, 5];
  const { data } = await readAll({ range: async (from) => ({ data: source.slice(from, from + 2), error: null }) });
  assert.deepEqual(data, source);
});

test("a failed later page rejects instead of returning a partial total", async () => {
  await assert.rejects(readAll({ range: async (from) => from === 0
    ? { data: [1, 2], error: null }
    : { data: null, error: { message: "offline" } } }), /offline/);
});

test("an empty successful result is valid", async () => {
  assert.deepEqual((await readAll({ range: async () => ({ data: [], error: null }) })).data, []);
});
