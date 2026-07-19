export const ONBOARDING_STORAGE_KEY = "arknights-infra-calc-beta-onboarding-v1";

export type SetupStep = "box" | "layout";

export function shouldAutoOpenSetup(seenValue: string | null, hasBox: boolean): boolean {
  return seenValue !== "1" && !hasBox;
}

export function initialSetupStep(hasBox: boolean): SetupStep {
  return hasBox ? "layout" : "box";
}
