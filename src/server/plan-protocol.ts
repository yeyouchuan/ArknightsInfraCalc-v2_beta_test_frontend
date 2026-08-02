import type { OperBoxEntry } from "../types";

export type ProtocolRecord = Record<string, unknown>;

export const PLAN_PROTOCOL_VERSION = 1;
export const PLAN_SCHEMA_VERSION = 1;
export const PLAN_CONTRACT_SHA256 = "52b78160b7f3290c6939807af5b7d6d31ee8322ea68de9288773eebca32d5102";

export type PlanComputeCapability = {
  supported: boolean;
  protocolVersion: number | null;
  schemaVersion: number | null;
  contractSha256: string | null;
  reason: string | null;
};

export type PlanComputePayload = {
  profile: ProtocolRecord;
  rotation: ProtocolRecord & { shifts: unknown[] };
  maa: ProtocolRecord;
};

export function isProtocolRecord(value: unknown): value is ProtocolRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function inspectPlanComputeCapability(response: unknown): PlanComputeCapability {
  const envelope = isProtocolRecord(response) ? response : {};
  const result = isProtocolRecord(envelope.result) ? envelope.result : {};
  const protocolVersion = typeof result.protocol_version === "number" ? result.protocol_version : null;
  const schemaVersion = typeof result.plan_schema_version === "number" ? result.plan_schema_version : null;
  const contractSha256 = typeof result.plan_contract_sha256 === "string" ? result.plan_contract_sha256 : null;

  if (envelope.ok !== true) {
    return {
      supported: false,
      protocolVersion,
      schemaVersion,
      contractSha256,
      reason: "ping 未返回成功响应",
    };
  }
  if (protocolVersion !== PLAN_PROTOCOL_VERSION) {
    return {
      supported: false,
      protocolVersion,
      schemaVersion,
      contractSha256,
      reason: `protocol_version 需要 ${PLAN_PROTOCOL_VERSION}，当前为 ${protocolVersion ?? "缺失"}`,
    };
  }
  if (schemaVersion !== PLAN_SCHEMA_VERSION) {
    return {
      supported: false,
      protocolVersion,
      schemaVersion,
      contractSha256,
      reason: `plan_schema_version 需要 ${PLAN_SCHEMA_VERSION}，当前为 ${schemaVersion ?? "缺失"}`,
    };
  }
  if (contractSha256 !== PLAN_CONTRACT_SHA256) {
    return {
      supported: false,
      protocolVersion,
      schemaVersion,
      contractSha256,
      reason: "plan.compute v1 契约 SHA-256 不匹配",
    };
  }

  return {
    supported: true,
    protocolVersion,
    schemaVersion,
    contractSha256,
    reason: null,
  };
}

export function assertUniqueOperboxIdentities(entries: OperBoxEntry[]) {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    const id = entry.id.trim();
    const name = entry.name.trim();
    if (!id || !name) {
      throw new Error(`operbox[${index}] 的 id 和 name 必须为非空字符串。`);
    }
    if (id !== entry.id || name !== entry.name) {
      throw new Error(`operbox[${index}] 的 id 和 name 不能包含首尾空格。`);
    }
    if (ids.has(id)) {
      throw new Error(`operbox 干员 ID 重复：${id}。`);
    }
    if (names.has(name)) {
      throw new Error(`operbox 干员名称重复：${name}。`);
    }
    ids.add(id);
    names.add(name);
  }
}

export function parsePlanComputePayload(response: unknown): PlanComputePayload | null {
  if (!isProtocolRecord(response) || response.ok !== true) return null;
  if (!isProtocolRecord(response.result)) {
    throw new Error("plan.compute 成功响应缺少 result 对象。");
  }

  const result = response.result;
  if (result.schema_version !== PLAN_SCHEMA_VERSION) {
    throw new Error(`plan.compute 响应 schema_version 应为 ${PLAN_SCHEMA_VERSION}。`);
  }
  if (!isProtocolRecord(result.profile)) {
    throw new Error("plan.compute 成功响应缺少 profile 对象。");
  }
  if (!isProtocolRecord(result.rotation) || !Array.isArray(result.rotation.shifts)) {
    throw new Error("plan.compute 成功响应缺少 rotation.shifts 数组。");
  }
  if (!isProtocolRecord(result.maa)) {
    throw new Error("plan.compute 成功响应缺少 maa 对象。");
  }

  return {
    profile: result.profile,
    rotation: { ...result.rotation, shifts: result.rotation.shifts },
    maa: result.maa,
  };
}
