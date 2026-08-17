import assert from "node:assert/strict";
import test from "node:test";

import { applyFiammettaSettings, isFiammettaTargetAvailable, scheduledOperatorNames, validateFiammettaExport } from "./fiammetta-settings.ts";
import type { MaaJson } from "./types.ts";

const maa: MaaJson = {
  title: "test",
  plans: [
    { name: "早班", rooms: {}, Fiammetta: { enable: true, target: "旧目标", order: "post" } },
    { name: "晚班", rooms: {} },
  ],
};

test("writes the selected Fiammetta target to every shift", () => {
  const result = applyFiammettaSettings(maa, { enabled: true, target: "巫恋" });
  assert.deepEqual(result.plans.map((plan) => plan.Fiammetta), [
    { enable: true, target: "巫恋", order: "pre" },
    { enable: true, target: "巫恋", order: "pre" },
  ]);
  assert.equal(maa.plans[0].Fiammetta?.target, "旧目标");
});

test("writes the selected Fiammetta execution order", () => {
  const result = applyFiammettaSettings(maa, { enabled: true, target: "巫恋", order: "post" });
  assert.deepEqual(result.plans.map((plan) => plan.Fiammetta), [
    { enable: true, target: "巫恋", order: "post" },
    { enable: true, target: "巫恋", order: "post" },
  ]);
});

test("removes Fiammetta output when the setting is disabled or incomplete", () => {
  assert.equal(applyFiammettaSettings(maa, { enabled: false, target: "巫恋" }).plans[0].Fiammetta, undefined);
  assert.equal(applyFiammettaSettings(maa, { enabled: true, target: null }).plans[0].Fiammetta, undefined);
});

test("preserves advanced MAA protocol fields while updating Fiammetta", () => {
  const protocolMaa: MaaJson = {
    title: "schedule",
    plans: [{
      name: "早班",
      description_post: "换班后说明",
      period: [["08:00", "20:00"]],
      duration: 720,
      groups: [{ name: "贸易组", operators: ["龙舌兰"] }],
      drones: { room: "trading", index: 1, rule: "all", order: "post" },
      rooms: {
        trading: [{ operators: ["龙舌兰"], candidates: ["但书"], use_operator_groups: true }],
      },
    }],
  };

  const updated = applyFiammettaSettings(protocolMaa, { enabled: true, target: "龙舌兰" });

  assert.equal(updated.plans[0].description_post, "换班后说明");
  assert.deepEqual(updated.plans[0].period, [["08:00", "20:00"]]);
  assert.deepEqual(updated.plans[0].groups, [{ name: "贸易组", operators: ["龙舌兰"] }]);
  assert.equal(updated.plans[0].drones?.rule, "all");
  assert.deepEqual(updated.plans[0].rooms.trading?.[0].candidates, ["但书"]);
});

test("collects only operators that actually participate in a generated schedule", () => {
  const schedule: MaaJson = {
    title: "schedule",
    plans: [{ name: "早班", rooms: { trading: [{ operators: ["巫恋", { name: "龙舌兰" }, null] }] } }],
  };
  assert.deepEqual([...scheduledOperatorNames(schedule)].sort(), ["巫恋", "龙舌兰"]);
});

test("blocks invalid Fiammetta exports", () => {
  const targets = new Set(["巫恋"]);
  assert.match(validateFiammettaExport({ settings: { enabled: true, target: "巫恋" }, ownsFiammetta: false, eligibleTargets: targets }) ?? "", /未拥有/);
  assert.match(validateFiammettaExport({ settings: { enabled: true, target: null }, ownsFiammetta: true, eligibleTargets: targets }) ?? "", /选择/);
  assert.match(validateFiammettaExport({ settings: { enabled: true, target: "闲置干员" }, ownsFiammetta: true, eligibleTargets: targets }) ?? "", /未参与/);
  assert.equal(validateFiammettaExport({ settings: { enabled: true, target: "巫恋" }, ownsFiammetta: true, eligibleTargets: targets }), null);
});

test("detects a Fiammetta target removed from the current schedule", () => {
  const targets = new Set(["巫恋"]);
  assert.equal(isFiammettaTargetAvailable("巫恋", targets), true);
  assert.equal(isFiammettaTargetAvailable("龙舌兰", targets), false);
  assert.equal(isFiammettaTargetAvailable(null, targets), false);
});
