import type {
  MaaJson,
  PlanApiResponse,
  PublicPlanData,
  RotationJson,
  UserProfile,
} from "../types";
import { stripInternalFields } from "../internal-field-safety.ts";
import { DEFAULT_ROTATION_PROFILE } from "../rotation-settings.ts";
import { isDebugToolsEnabled, PublicApiError } from "./api-contract.ts";
import { normalizeRotationResult, rotationFallbackProfile } from "../rotation-result.ts";

const PATH_SEPARATOR = /[/\\]+/g;

function safeDuration(value: unknown): number {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

export function safeDisplayName(value: unknown, fallback: string, maxLength = 80): string {
  const normalized = String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(PATH_SEPARATOR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

function sanitizeProfile(profile: UserProfile, layoutLabel: string, sourceName: string): UserProfile {
  return {
    ...stripInternalFields(structuredClone(profile)),
    layout_label: safeDisplayName(layoutLabel, "当前布局"),
    operbox_label: safeDisplayName(sourceName, "已导入的干员数据"),
    baseline_label: "产品推荐基准",
    domains: profile.domains.map((domain) => ({
      ...domain,
      label: safeDisplayName(domain.label, "效率指标", 120),
    })),
  };
}

function sanitizeMaa(maa: MaaJson, layoutLabel: string): MaaJson {
  return {
    ...stripInternalFields(structuredClone(maa)),
    title: `明日方舟基建排班助手 · ${safeDisplayName(layoutLabel, "当前布局")}`,
  };
}

export function toPublicPlanData(
  result: PlanApiResponse,
  input: { layoutLabel: string; sourceName: string },
  requestId: string
): PublicPlanData {
  if (!result.success || !result.profileJson || !result.maaJson || !result.rotationJson) {
    const message = result.error?.toLowerCase() ?? "";
    if (message.includes("timeout") || message.includes("超时")) {
      throw new PublicApiError("AIC-PLAN-3003");
    }
    if (message.includes("没有找到可运行") || message.includes("未找到可运行")) {
      throw new PublicApiError("AIC-PLAN-3001");
    }
    throw new PublicApiError("AIC-PLAN-3004");
  }

  const data: PublicPlanData = {
    profile: sanitizeProfile(result.profileJson, input.layoutLabel, input.sourceName),
    maa: sanitizeMaa(result.maaJson, input.layoutLabel),
    rotation: normalizeRotationResult({
      source: result.rotationJson as RotationJson,
      profile: result.profileJson,
      fallbackProfile: rotationFallbackProfile(result.profileJson, DEFAULT_ROTATION_PROFILE),
    }),
    durationMs: safeDuration(result.durationMs),
    diagnosticId: result.runId ?? requestId,
  };

  if (isDebugToolsEnabled()) {
    data.debug = {
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      debugBundle: result.debugBundle,
    };
  }
  return data;
}
