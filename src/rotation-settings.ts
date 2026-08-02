import type { RotationProfile } from "./types";

export type RotationOption = {
  profile: RotationProfile;
  label: string;
  durations: number[];
};

export const DEFAULT_ROTATION_PROFILE: RotationProfile = "abc_12_6_6";

export const ROTATION_OPTIONS: RotationOption[] = [
  { profile: "abc_12_6_6", label: "一天三换", durations: [12, 6, 6] },
  { profile: "main_backup_12_12", label: "主备轮换", durations: [12, 12] },
  { profile: "fiammetta_8_8_4_4", label: "菲亚梅塔轮换", durations: [8, 8, 4, 4] },
  { profile: "abyssal_7_5_7_5", label: "深海猎人轮换", durations: [7, 5, 7, 5] },
];

const SUPPORTED_ROTATION_PROFILES = ROTATION_OPTIONS.map(({ profile }) => profile);

export function isRotationProfile(value: unknown): value is RotationProfile {
  return typeof value === "string" && SUPPORTED_ROTATION_PROFILES.includes(value as RotationProfile);
}

export function normalizeRotationProfile(value: unknown): RotationProfile {
  return isRotationProfile(value) ? value : DEFAULT_ROTATION_PROFILE;
}

export function rotationOption(profile: RotationProfile): RotationOption {
  return ROTATION_OPTIONS.find((option) => option.profile === profile) ?? ROTATION_OPTIONS[0];
}
