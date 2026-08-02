import type {
  BaseBlueprint,
  BoxSource,
  MaaJson,
  OperBoxEntry,
  PublicPlanData,
  RotationProfile,
  UserProfile,
} from "./types";
import { stripInternalFields } from "./internal-field-safety.ts";
import { normalizeRotationProfile } from "./rotation-settings.ts";
import { normalizeRotationResult } from "./rotation-result.ts";

export const SESSION_KEY_V4 = "arknights-infra-calc-session-v4";
export const SESSION_KEY_V3 = "arknights-infra-calc-beta-session-v3";
export const SESSION_KEY_V2 = "arknights-infra-calc-beta-session-v2";
export const RESULT_CLEAR_WARNING_DISMISSED_KEY = "arknights-infra-calc-result-clear-warning-dismissed";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SKLAND_SOURCE_NAME = "森空岛同步";

export interface PersistedSessionV4 {
  version: 4;
  savedAt: string;
  expiresAt: string;
  presetLabel: string;
  layout: BaseBlueprint;
  operbox: OperBoxEntry[] | null;
  sourceName: string | null;
  boxSource: BoxSource;
  layoutDirty: boolean;
  rotationProfile: RotationProfile;
  result: PublicPlanData | null;
  activeShift: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeDuration(value: unknown): number {
  const duration = Number(value);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function validLayout(value: unknown): value is BaseBlueprint {
  if (!isObject(value) || typeof value.template !== "string" || !Array.isArray(value.rooms) || !isObject(value.scenario)) {
    return false;
  }
  return value.rooms.length <= 64 && value.rooms.every((room) =>
    isObject(room)
    && typeof room.id === "string"
    && typeof room.kind === "string"
    && Number.isInteger(room.level)
  );
}

function validOperbox(value: unknown): value is OperBoxEntry[] {
  return Array.isArray(value)
    && value.length <= 1000
    && value.every((entry) =>
      isObject(entry)
      && typeof entry.id === "string"
      && typeof entry.name === "string"
      && typeof entry.own === "boolean"
    );
}

function safeResult(value: unknown, fallbackProfile: RotationProfile): PublicPlanData | null {
  if (!isObject(value)) return null;

  const profile = (value.profile ?? value.profileJson) as UserProfile | undefined;
  const maa = (value.maa ?? value.maaJson) as MaaJson | undefined;
  const rotation = value.rotation ?? value.rotationJson;
  if (!isObject(profile) || !isObject(maa) || !isObject(rotation)) return null;
  if (!Array.isArray(maa.plans) || !Array.isArray(rotation.shifts)) return null;

  return {
    profile: stripInternalFields(structuredClone(profile)),
    maa: stripInternalFields(structuredClone(maa)),
    rotation: normalizeRotationResult({
      source: rotation,
      profile,
      fallbackProfile,
    }),
    durationMs: safeDuration(value.durationMs),
    diagnosticId:
      typeof value.diagnosticId === "string"
        ? value.diagnosticId.slice(0, 80)
        : typeof value.runId === "string"
          ? value.runId.slice(0, 80)
          : "migrated-session",
  };
}

function clampActiveShift(value: unknown, result: PublicPlanData | null): number {
  if (!Number.isInteger(value) || !result) return 0;
  const shiftCount = Math.min(result.maa.plans.length, result.rotation.shifts.length);
  return Math.max(0, Math.min(Math.max(0, shiftCount - 1), Number(value)));
}

function normalizeSession(value: unknown, now: number): PersistedSessionV4 | null {
  if (!isObject(value)) return null;
  const layout = value.layout;
  const operbox = value.operbox;
  if (!validLayout(layout) || (operbox !== null && operbox !== undefined && !validOperbox(operbox))) return null;

  const savedAt = typeof value.savedAt === "string" ? Date.parse(value.savedAt) : now;
  const expiresAt = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : savedAt + SESSION_TTL_MS;
  if (!Number.isFinite(savedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const boxSource = value.boxSource === "skland" || value.boxSource === "maa" || value.boxSource === "sample"
    ? value.boxSource
    : "sample";
  const rawSourceName =
    typeof value.sourceName === "string"
      ? value.sourceName.slice(0, 80)
      : typeof value.fileName === "string"
        ? value.fileName.slice(0, 80)
        : null;
  const hasLegacySklandIdentity = boxSource === "skland" && rawSourceName?.startsWith("skland:");
  const rotationProfile = normalizeRotationProfile(value.rotationProfile);
  const result = hasLegacySklandIdentity ? null : safeResult(value.result, rotationProfile);
  return {
    version: 4,
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    presetLabel:
      typeof value.presetLabel === "string"
        ? value.presetLabel
        : isObject(value.preset) && typeof value.preset.label === "string"
          ? value.preset.label
          : layout.template,
    layout: structuredClone(layout),
    operbox: operbox ? structuredClone(operbox) : null,
    sourceName: boxSource === "skland" ? SKLAND_SOURCE_NAME : rawSourceName,
    boxSource,
    layoutDirty: Boolean(value.layoutDirty),
    rotationProfile,
    result,
    activeShift: clampActiveShift(value.activeShift, result),
  };
}

export function loadPersistedSession(storage: StorageLike, now = Date.now()): PersistedSessionV4 | null {
  const currentRaw = storage.getItem(SESSION_KEY_V4);
  const current = normalizeSession(parseJson(currentRaw), now);
  if (current) {
    if (currentRaw && currentRaw !== JSON.stringify(current)) {
      storage.setItem(SESSION_KEY_V4, JSON.stringify(current));
    }
    return current;
  }
  if (currentRaw) storage.removeItem(SESSION_KEY_V4);

  for (const legacyKey of [SESSION_KEY_V3, SESSION_KEY_V2]) {
    const legacyRaw = storage.getItem(legacyKey);
    if (!legacyRaw) continue;
    const migrated = normalizeSession(parseJson(legacyRaw), now);
    storage.removeItem(legacyKey);
    if (!migrated) continue;
    storage.setItem(SESSION_KEY_V4, JSON.stringify(migrated));
    return migrated;
  }
  return null;
}

export function persistSession(
  storage: StorageLike,
  input: Omit<PersistedSessionV4, "version" | "savedAt" | "expiresAt">,
  now = Date.now()
): PersistedSessionV4 {
  const hasLegacySklandIdentity =
    input.boxSource === "skland" && input.sourceName?.startsWith("skland:");
  const result = hasLegacySklandIdentity ? null : safeResult(input.result, input.rotationProfile);
  const value: PersistedSessionV4 = {
    ...input,
    sourceName: input.boxSource === "skland" ? SKLAND_SOURCE_NAME : input.sourceName,
    version: 4,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    result,
    activeShift: clampActiveShift(input.activeShift, result),
  };
  storage.setItem(SESSION_KEY_V4, JSON.stringify(value));
  storage.removeItem(SESSION_KEY_V3);
  storage.removeItem(SESSION_KEY_V2);
  return value;
}

export function clearLocalProductData(storage: StorageLike, extraKeys: string[] = []): void {
  [
    SESSION_KEY_V2,
    SESSION_KEY_V3,
    SESSION_KEY_V4,
    RESULT_CLEAR_WARNING_DISMISSED_KEY,
    ...extraKeys,
  ].forEach((key) => storage.removeItem(key));
}
