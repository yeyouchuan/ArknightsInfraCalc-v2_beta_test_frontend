import type { MaaJson, MaaOperatorSlot } from "./types";

export interface FiammettaSettings {
  enabled: boolean;
  target: string | null;
  order?: "pre" | "post";
}

export function isFiammettaTargetAvailable(target: string | null, eligibleTargets: ReadonlySet<string>): boolean {
  return Boolean(target && eligibleTargets.has(target));
}

function operatorName(value: string | MaaOperatorSlot | null): string | null {
  if (typeof value === "string") return value.trim() || null;
  return value?.name?.trim() || null;
}

export function scheduledOperatorNames(maa: MaaJson | null | undefined): Set<string> {
  const names = new Set<string>();
  for (const plan of maa?.plans ?? []) {
    for (const rooms of Object.values(plan.rooms)) {
      for (const room of rooms ?? []) {
        for (const operator of room.operators) {
          const name = operatorName(operator);
          if (name) names.add(name);
        }
      }
    }
  }
  return names;
}

export function validateFiammettaExport({
  settings,
  ownsFiammetta,
  eligibleTargets,
}: {
  settings: FiammettaSettings;
  ownsFiammetta: boolean;
  eligibleTargets: ReadonlySet<string>;
}): string | null {
  if (!settings.enabled) return null;
  if (!ownsFiammetta) return "当前 Box 未拥有菲亚梅塔，无法执行恢复心情。";
  const target = settings.target?.trim();
  if (!target) return "请先选择菲亚梅塔恢复心情的目标干员。";
  if (!eligibleTargets.has(target)) return "目标干员未参与当前排班或没有可用基建技能，请重新选择。";
  return null;
}

export function applyFiammettaSettings(maa: MaaJson, settings: FiammettaSettings): MaaJson {
  const target = settings.target?.trim();
  return {
    ...structuredClone(maa),
    plans: maa.plans.map((plan) => {
      const next = structuredClone(plan);
      if (!settings.enabled || !target) {
        delete next.Fiammetta;
        return next;
      }
      next.Fiammetta = { enable: true, target, order: settings.order === "post" ? "post" : "pre" };
      return next;
    }),
  };
}
