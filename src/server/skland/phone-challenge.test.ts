import assert from "node:assert/strict";
import test from "node:test";

import {
  isSklandPhoneCode,
  normalizeSklandPhone,
  PHONE_CHALLENGE_MAX_FAILURES,
  PHONE_CHALLENGE_TTL_MS,
  PhoneChallengeRegistry,
  sklandPhoneRateSubject,
} from "./phone-challenge.ts";

test("normalizes supported mainland phone formats", () => {
  assert.equal(normalizeSklandPhone("13800138000"), "13800138000");
  assert.equal(normalizeSklandPhone("+86 138-0013-8000"), "13800138000");
  assert.equal(normalizeSklandPhone(" 138 0013 8000 "), "13800138000");
  assert.equal(normalizeSklandPhone("8613800138000"), null);
  assert.equal(normalizeSklandPhone("23800138000"), null);
  assert.equal(normalizeSklandPhone("1380013800"), null);
});

test("accepts only six digit verification codes", () => {
  assert.equal(isSklandPhoneCode("123456"), true);
  assert.equal(isSklandPhoneCode("12345"), false);
  assert.equal(isSklandPhoneCode("12345a"), false);
});

test("keeps the same client for a challenge and expires it after ten minutes", () => {
  const client = { id: "same-device-client" };
  const registry = new PhoneChallengeRegistry<object>(new Map(), () => "challenge-1");
  const challengeId = registry.create("13800138000", client, 1_000);

  assert.equal(challengeId, "challenge-1");
  assert.equal(registry.get(challengeId, 1_000)?.client, client);
  assert.equal(
    registry.get(challengeId, 1_000 + PHONE_CHALLENGE_TTL_MS - 1)?.client,
    client
  );
  assert.equal(registry.get(challengeId, 1_000 + PHONE_CHALLENGE_TTL_MS), null);
  assert.equal(registry.size, 0);
});

test("removes a challenge after five failed verification attempts", () => {
  const registry = new PhoneChallengeRegistry<object>(new Map(), () => "challenge-2");
  const challengeId = registry.create("13800138000", {}, 2_000);

  for (let attempt = 1; attempt < PHONE_CHALLENGE_MAX_FAILURES; attempt += 1) {
    assert.equal(
      registry.recordFailure(challengeId, 2_000),
      PHONE_CHALLENGE_MAX_FAILURES - attempt
    );
    assert.ok(registry.get(challengeId, 2_000));
  }
  assert.equal(registry.recordFailure(challengeId, 2_000), 0);
  assert.equal(registry.get(challengeId, 2_000), null);
});

test("allows only one in-flight verification per challenge", () => {
  const client = { id: "single-flight-client" };
  const registry = new PhoneChallengeRegistry<object>(new Map(), () => "challenge-3");
  const challengeId = registry.create("13800138000", client, 3_000);

  assert.equal(registry.acquire(challengeId, 3_000)?.client, client);
  assert.equal(registry.acquire(challengeId, 3_000), null);

  registry.recordFailure(challengeId, 3_000);
  assert.equal(registry.acquire(challengeId, 3_000)?.client, client);

  registry.release(challengeId);
  assert.equal(registry.acquire(challengeId, 3_000)?.client, client);
});

test("uses a one-way SHA-256 subject for phone rate limits", () => {
  const subject = sklandPhoneRateSubject("13800138000");
  assert.equal(subject.length, 64);
  assert.match(subject, /^[0-9a-f]+$/);
  assert.equal(subject.includes("13800138000"), false);
  assert.equal(subject, sklandPhoneRateSubject("13800138000"));
});
