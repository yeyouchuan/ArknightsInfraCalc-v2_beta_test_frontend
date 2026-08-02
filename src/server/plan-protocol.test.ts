import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_CONTRACT_SHA256,
  assertUniqueOperboxIdentities,
  inspectPlanComputeCapability,
  parsePlanComputePayload,
} from "./plan-protocol.ts";

test("accepts the exact plan.compute v1 worker contract", () => {
  assert.equal(
    PLAN_CONTRACT_SHA256,
    "52b78160b7f3290c6939807af5b7d6d31ee8322ea68de9288773eebca32d5102"
  );
  const capability = inspectPlanComputeCapability({
    ok: true,
    result: {
      pong: true,
      protocol_version: 1,
      plan_schema_version: 1,
      plan_contract_sha256: PLAN_CONTRACT_SHA256,
    },
  });

  assert.equal(capability.supported, true);
  assert.equal(capability.reason, null);
});

test("keeps a legacy worker on the legacy plan method", () => {
  const capability = inspectPlanComputeCapability({ ok: true, result: { pong: true } });

  assert.equal(capability.supported, false);
  assert.match(capability.reason ?? "", /protocol_version/);
});

test("rejects a plan.compute worker with a different contract hash", () => {
  const capability = inspectPlanComputeCapability({
    ok: true,
    result: {
      protocol_version: 1,
      plan_schema_version: 1,
      plan_contract_sha256: "0".repeat(64),
    },
  });

  assert.equal(capability.supported, false);
  assert.match(capability.reason ?? "", /SHA-256/);
});

test("validates the complete plan.compute success payload", () => {
  const payload = parsePlanComputePayload({
    ok: true,
    result: {
      schema_version: 1,
      profile: { schema_version: 4 },
      rotation: { profile: "abc_12_6_6", daily: {}, shifts: [] },
      maa: { plans: [] },
    },
  });

  assert.deepEqual(payload?.rotation.shifts, []);
  assert.equal(payload?.profile.schema_version, 4);
});

test("rejects malformed successful plan.compute payloads", () => {
  assert.throws(
    () => parsePlanComputePayload({ ok: true, result: { schema_version: 1, profile: {}, rotation: { shifts: [] } } }),
    /maa/
  );
});

test("rejects duplicate operbox names without rewriting them", () => {
  const entries = [
    { id: "char_1", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
    { id: "char_2", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
  ];

  assert.throws(() => assertUniqueOperboxIdentities(entries), /干员名称重复：阿米娅/);
  assert.equal(entries[1].name, "阿米娅");
});
