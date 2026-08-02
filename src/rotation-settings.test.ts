import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ROTATION_PROFILE,
  ROTATION_OPTIONS,
  isRotationProfile,
  normalizeRotationProfile,
  rotationOption,
} from "./rotation-settings.ts";

test("exposes only the profiles accepted by plan.compute v1", () => {
  assert.deepEqual(ROTATION_OPTIONS.map(({ profile }) => profile), [
    "abc_12_6_6",
    "main_backup_12_12",
    "fiammetta_8_8_4_4",
    "abyssal_7_5_7_5",
  ]);
  assert.equal(isRotationProfile("abc_12_6_6"), true);
  assert.equal(isRotationProfile("auto_rotation"), false);
});

test("keeps the worker-defined durations for every supported profile", () => {
  assert.deepEqual(rotationOption("abc_12_6_6").durations, [12, 6, 6]);
  assert.deepEqual(rotationOption("main_backup_12_12").durations, [12, 12]);
  assert.deepEqual(rotationOption("fiammetta_8_8_4_4").durations, [8, 8, 4, 4]);
  assert.deepEqual(rotationOption("abyssal_7_5_7_5").durations, [7, 5, 7, 5]);
});

test("invalid persisted values fall back to the existing default profile", () => {
  assert.equal(normalizeRotationProfile("fiammetta_8_8_4_4"), "fiammetta_8_8_4_4");
  assert.equal(normalizeRotationProfile("automatic"), DEFAULT_ROTATION_PROFILE);
  assert.equal(normalizeRotationProfile(null), DEFAULT_ROTATION_PROFILE);
});
