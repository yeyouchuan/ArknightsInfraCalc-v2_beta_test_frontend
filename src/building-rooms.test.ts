import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDING_ROOM_LABELS,
  BUILDING_ROOM_PREFIXES,
  buildingRoomPrefixForSkillId,
  filterOperators,
  operatorMatchesNameContains,
  operatorMatchesRooms,
  type BuildingRoomPrefix,
  type OperatorWithSkills,
} from "./building-rooms.ts";
import { OPERATOR_CATALOG } from "./operatorPortraits.ts";

test("derives the building-room prefix from the skill id's first underscore segment", () => {
  assert.equal(buildingRoomPrefixForSkillId("control_tra_spd_000"), "control");
  assert.equal(buildingRoomPrefixForSkillId("manu_spd_000"), "manu");
  assert.equal(buildingRoomPrefixForSkillId("workshop_formula_cost_000"), "workshop");
  for (const prefix of BUILDING_ROOM_PREFIXES) {
    assert.equal(buildingRoomPrefixForSkillId(`${prefix}_anything_000`), prefix);
  }
  assert.equal(buildingRoomPrefixForSkillId("bank_x"), null);
  assert.equal(buildingRoomPrefixForSkillId("no-underscore"), null);
});

test("maps the nine room prefixes to their Chinese labels", () => {
  const expected: Readonly<Record<BuildingRoomPrefix, string>> = {
    control: "控制中枢",
    power: "发电站",
    manu: "制造站",
    trade: "贸易站",
    dorm: "宿舍",
    hire: "办公室",
    meet: "会客室",
    train: "训练室",
    workshop: "加工站",
  };
  assert.deepEqual({ ...BUILDING_ROOM_LABELS }, expected);
  assert.equal(BUILDING_ROOM_PREFIXES.length, 9);
  assert.equal(new Set(BUILDING_ROOM_PREFIXES).size, 9);
  assert.deepEqual([...BUILDING_ROOM_PREFIXES].sort(), [...Object.keys(expected)].sort());
});

test("filters operators by room prefix with intersection (AND) semantics", () => {
  assert.equal(operatorMatchesRooms([], []), true);
  assert.equal(operatorMatchesRooms(["control_x"], []), true);
  assert.equal(operatorMatchesRooms(["control_x"], ["control"]), true);
  assert.equal(operatorMatchesRooms(["manu_x"], ["control"]), false);
  assert.equal(operatorMatchesRooms(["manu_x"], ["control", "manu"]), false);
  assert.equal(operatorMatchesRooms(["manu_x", "control_y"], ["control", "manu"]), true);
  assert.equal(operatorMatchesRooms(["manu_x", "control_y"], ["control"]), true);
  assert.equal(operatorMatchesRooms(["manu_x", "control_y"], ["control", "manu", "dorm"]), false);
  assert.equal(operatorMatchesRooms([], ["control"]), false);
});

test("matches operator names by case-insensitive trimmed substring", () => {
  assert.equal(operatorMatchesNameContains("阿米娅", ""), true);
  assert.equal(operatorMatchesNameContains("阿米娅", "   "), true);
  assert.equal(operatorMatchesNameContains("阿米娅", "阿"), true);
  assert.equal(operatorMatchesNameContains("阿米娅", "米"), true);
  assert.equal(operatorMatchesNameContains("阿米娅", "能"), false);
  assert.equal(operatorMatchesNameContains("THRM-EX", "thrm"), true);
  assert.equal(operatorMatchesNameContains("阿米娅", " 米 "), true);
});

test("combines room and name-substring filters with AND and sorts by name", () => {
  const operators: OperatorWithSkills[] = [
    { name: "阿米娅", buildingSkills: [{ id: "control_x" }, { id: "dorm_y" }] },
    { name: "能天使", buildingSkills: [{ id: "manu_x" }] },
    { name: "阿能", buildingSkills: [{ id: "manu_y" }] },
  ];
  assert.deepEqual(filterOperators(operators, ["manu"], "阿").map((operator) => operator.name), ["阿能"]);
  assert.deepEqual(filterOperators(operators, ["control"], "").map((operator) => operator.name), ["阿米娅"]);
  assert.deepEqual(filterOperators(operators, ["control", "dorm"], "").map((operator) => operator.name), ["阿米娅"]);
  assert.deepEqual(filterOperators(operators, ["control", "manu"], ""), []);
  assert.deepEqual(filterOperators(operators, ["trade"], "阿"), []);
  assert.deepEqual(filterOperators(operators, [], "能").map((operator) => operator.name), ["阿能", "能天使"]);
  const all = filterOperators(operators, [], "").map((operator) => operator.name);
  assert.equal(all.length, 3);
  assert.ok(all.includes("阿米娅") && all.includes("阿能") && all.includes("能天使"));
});

test("filters the real catalog by substring query", () => {
  const names = filterOperators(OPERATOR_CATALOG, [], "黑角").map((operator) => operator.name);
  assert.ok(names.includes("黑角"));
  assert.ok(names.every((name) => name.includes("黑角")));
});
