import assert from "node:assert/strict";
import test from "node:test";

import { parseShiftFile } from "./shift-parser.ts";

test("keeps the versioned score structure", () => {
  const shift = { scores: { room_lines: [{ room_id: "trade_1", trade_pct: 120 }] } };
  assert.deepEqual(parseShiftFile(JSON.stringify(shift), 0), shift);
});

test("normalizes legacy rooms efficiency", () => {
  const parsed = parseShiftFile(JSON.stringify({ rooms: [{ room_id: "manu_1", efficiency: { manu_prod_total: 145 } }] }), 1) as any;
  assert.equal(parsed.index, 1);
  assert.equal(parsed.scores.room_lines[0].manu_prod_total, 145);
});

test("recovers numeric efficiency from damaged JSON text", () => {
  const raw = '{"rooms":[{"room_id":"trade_1","operators":[{"name":"坏字符}],"efficiency":{"trade_pct":200}}]}';
  const parsed = parseShiftFile(raw, 2) as any;
  assert.equal(parsed.scores.room_lines[0].trade_pct, 200);
});
