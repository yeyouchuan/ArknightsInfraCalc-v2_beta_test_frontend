import assert from "node:assert/strict";
import test from "node:test";

import { validateLayoutJson } from "./layout-validation.ts";

function validLayout() {
  return {
    template: "243",
    drone_cap: 235,
    scenario: {},
    rooms: [
      { id: "control", kind: "control_center", level: 5 },
      { id: "trade_1", kind: "trade_post", level: 3, product: { trade: { order: "gold" } } },
      { id: "manu_1", kind: "factory", level: 3, product: { factory: { recipe: "battle_record" } } },
      { id: "power_1", kind: "power_plant", level: 3 },
      { id: "dorm_1", kind: "dormitory", level: 5, dorm_beds: 5 },
      { id: "training_room", kind: "training_room", level: 3 },
    ],
  };
}

test("accepts level-five facilities and the training room", () => {
  assert.deepEqual(validateLayoutJson(validLayout()), []);
});

test("rejects values that the core u32 and facility schema cannot consume", () => {
  const layout = validLayout();
  layout.drone_cap = 1.5;
  layout.rooms[5].level = 4;

  const errors = validateLayoutJson(layout);
  assert.ok(errors.some((message) => message.includes("drone_cap")));
  assert.ok(errors.some((message) => message.includes("rooms[5].level")));
});

test("rejects unknown kinds, duplicate IDs, and padded IDs", () => {
  const layout = validLayout();
  layout.rooms.push(
    { id: "power_1", kind: "unknown", level: 1 },
    { id: " padded ", kind: "office", level: 3 }
  );

  const errors = validateLayoutJson(layout);
  assert.ok(errors.some((message) => message.includes("房间 ID 重复")));
  assert.ok(errors.some((message) => message.includes("kind 不受支持")));
  assert.ok(errors.some((message) => message.includes("首尾空格")));
});
