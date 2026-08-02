import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRotationResult } from "./rotation-result.ts";

test("plan.compute rotation keeps the worker profile and daily summary while whitelisting shifts", () => {
  const rotation = normalizeRotationResult({
    source: {
      profile: "fiammetta_8_8_4_4",
      daily: { trade: 5.288, manufacture: 9.175, power: 3.552 },
      future_internal: "must not pass",
    },
    shifts: [{
      index: 3,
      duration_hours: 4,
      active_teams: ["alpha", "gamma", 7],
      resting_team: "beta",
      assignment: { rooms: ["private solver detail"] },
      efficiencies: {
        trade_efficiency: 2.4,
        manufacture_efficiency: 5.5,
        power_efficiency: 1.2,
        room_lines: [{
          room_id: "manu_1",
          manufacture_efficiency: 1.55,
          manufacture_skill_efficiency: 0.95,
          manufacture_display_efficiency: 1.05,
          future_internal: 12,
        }],
      },
      weighted_trade: 0.4,
      weighted_manufacture: 0.917,
      weighted_power: 0.2,
    }],
    profile: {},
    fallbackProfile: "abc_12_6_6",
  });

  assert.equal(rotation.profile, "fiammetta_8_8_4_4");
  assert.deepEqual(rotation.daily, { trade: 5.288, manu: 9.175, power: 3.552 });
  assert.deepEqual(rotation.shifts[0], {
    index: 3,
    duration_hours: 4,
    active_teams: ["alpha", "gamma"],
    resting_team: "beta",
    scores: {
      trade_score: 2.4,
      manu_prod_sum: 550,
      power_charge_sum: 120,
      room_lines: [{
        room_id: "manu_1",
        manu_score: 155,
        manu_prod_skill: 95,
        manu_display_pct: 105,
      }],
    },
    weighted_trade: 0.4,
    weighted_manu: 0.917,
    weighted_power: 0.2,
  });
  assert.equal("efficiencies" in rotation.shifts[0], false);
  assert.equal("assignment" in rotation.shifts[0], false);
  assert.equal("future_internal" in rotation, false);
});

test("legacy rotation falls back through result and profile fields", () => {
  const rotation = normalizeRotationResult({
    source: {
      rotation: "main_backup_12_12",
      daily_trade_efficiency: 4.2,
      daily_manufacture_efficiency: 8.4,
      daily_power_efficiency: 3.1,
      shifts: [{
        scores: {
          trade_score: 1.8,
          manu_prod_sum: 420,
          power_charge_sum: 110,
          room_lines: [{ room_id: "trade_1", trade_score: 1.8, trade_skill_pct: 80 }],
        },
      }, { scores: {} }],
    },
    profile: { rotation_profile: "abc_12_6_6", rotation: {} },
    fallbackProfile: "abyssal_7_5_7_5",
  });

  assert.equal(rotation.profile, "main_backup_12_12");
  assert.deepEqual(rotation.daily, { trade: 4.2, manu: 8.4, power: 3.1 });
  assert.equal(rotation.shifts[0].duration_hours, 12);
  assert.equal(rotation.shifts[1].duration_hours, 12);
  assert.deepEqual(rotation.shifts[0].scores.room_lines[0], {
    room_id: "trade_1",
    trade_score: 1.8,
    trade_skill_pct: 80,
  });
});

test("missing summaries use the profile snapshot and requested profile", () => {
  const rotation = normalizeRotationResult({
    source: {},
    shifts: [],
    profile: {
      rotation: {
        daily_trade_efficiency: 3,
        daily_manufacture_efficiency: 6,
        daily_power_efficiency: 2,
      },
    },
    fallbackProfile: "abyssal_7_5_7_5",
  });

  assert.equal(rotation.profile, "abyssal_7_5_7_5");
  assert.deepEqual(rotation.daily, { trade: 3, manu: 6, power: 2 });
});
