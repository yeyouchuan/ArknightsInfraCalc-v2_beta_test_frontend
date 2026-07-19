import type { RoomEfficiency, RotationRoomLine, UserProfileComboSnapshot, UserProfileSummary } from "./types";

export interface EfficiencyDetail {
  label: string;
  value: string;
  kind?: "cross-station" | "default";
}

export interface RoomEfficiencyPresentation {
  primaryLabel: string;
  primaryValue: string;
  includesCrossStation: boolean;
  details: EfficiencyDetail[];
}

function formatNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.0$/, "");
}

function percent(value: number): string {
  return `${formatNumber(value)}%`;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}%`;
}

function different(left: number | undefined, right: number | undefined): boolean {
  return left !== undefined && right !== undefined && Math.abs(left - right) >= 0.05;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeServeRoomEfficiency(line: Record<string, unknown>): RotationRoomLine {
  const trade = finiteNumber(line.trade_efficiency);
  const tradeSkill = finiteNumber(line.trade_skill_efficiency);
  const tradeDisplay = finiteNumber(line.trade_display_efficiency);
  const manufacture = finiteNumber(line.manufacture_efficiency);
  const manufactureSkill = finiteNumber(line.manufacture_skill_efficiency);
  const manufactureDisplay = finiteNumber(line.manufacture_display_efficiency);
  const power = finiteNumber(line.power_efficiency);
  const powerSkill = finiteNumber(line.power_skill_efficiency);
  const powerDisplay = finiteNumber(line.power_display_efficiency);

  return {
    room_id: typeof line.room_id === "string" ? line.room_id : "",
    ...(trade !== undefined ? { trade_score: trade } : {}),
    ...(tradeSkill !== undefined ? { trade_skill_pct: tradeSkill * 100 } : {}),
    ...(tradeDisplay !== undefined ? { trade_display_pct: tradeDisplay * 100 } : {}),
    ...(manufacture !== undefined ? { manu_score: manufacture * 100 } : {}),
    ...(manufactureSkill !== undefined ? { manu_prod_skill: manufactureSkill * 100 } : {}),
    ...(manufactureDisplay !== undefined ? { manu_display_pct: manufactureDisplay * 100 } : {}),
    ...(power !== undefined ? { power_score: power * 100 } : {}),
    ...(powerSkill !== undefined ? { power_skill_pct: powerSkill * 100 } : {}),
    ...(powerDisplay !== undefined ? { power_display_pct: powerDisplay * 100 } : {}),
  };
}

function displayDetails(
  display: number | undefined,
  skill: number | undefined
): { includesCrossStation: boolean; details: EfficiencyDetail[] } {
  if (display === undefined || skill === undefined) return { includesCrossStation: false, details: [] };

  const bonus = display - skill;
  return {
    includesCrossStation: different(display, skill),
    details: [
      { label: "纯技能", value: percent(skill) },
      ...(different(display, skill)
        ? [{ label: "跨设施", value: signedPercent(bonus), kind: "cross-station" as const }]
        : []),
    ],
  };
}

export function presentRoomEfficiency(
  group: string,
  efficiency: RoomEfficiency | undefined
): RoomEfficiencyPresentation | null {
  if (!efficiency) return null;

  if (group === "trading") {
    const skill = efficiency.trade_skill_pct;
    const display = efficiency.trade_display_pct;
    const fallback = efficiency.trade_pct;
    const primary = display ?? skill ?? fallback;
    if (primary === undefined) return null;
    const displayBreakdown = displayDetails(display, skill);
    const details = [...displayBreakdown.details];
    if (efficiency.trade_score !== undefined) {
      details.push({ label: "订单倍率", value: `${formatNumber(efficiency.trade_score, 2)}×` });
    }
    if (efficiency.trade_pct !== undefined && different(efficiency.trade_pct, primary)) {
      details.push({ label: "订单加成", value: percent(efficiency.trade_pct) });
    }
    if (efficiency.trade_gold_pct !== undefined) {
      details.push({ label: "赤金加成", value: percent(efficiency.trade_gold_pct) });
    }
    return {
      primaryLabel: display !== undefined ? "展示效率" : skill !== undefined ? "纯技能效率" : "订单效率",
      primaryValue: percent(primary),
      includesCrossStation: displayBreakdown.includesCrossStation,
      details,
    };
  }

  if (group === "manufacture") {
    const skill = efficiency.manu_prod_skill;
    const display = efficiency.manu_display_pct;
    const total = efficiency.manu_prod_total ?? efficiency.manu_score;
    const primary = display ?? skill ?? total;
    if (primary === undefined) return null;
    const displayBreakdown = displayDetails(display, skill);
    const details = [...displayBreakdown.details];
    if (total !== undefined && different(total, primary)) {
      details.push({ label: "总制造", value: percent(total) });
    }
    if (efficiency.manu_storage_limit !== undefined) {
      details.push({ label: "仓储上限", value: formatNumber(efficiency.manu_storage_limit) });
    }
    return {
      primaryLabel: display !== undefined ? "展示效率" : skill !== undefined ? "纯技能效率" : "制造效率",
      primaryValue: percent(primary),
      includesCrossStation: displayBreakdown.includesCrossStation,
      details,
    };
  }

  if (group === "power") {
    const scoreFallback = efficiency.power_score !== undefined ? Math.max(0, efficiency.power_score - 100) : undefined;
    const skill = efficiency.power_skill_pct ?? efficiency.power_charge_speed_pct ?? scoreFallback;
    const display = efficiency.power_display_pct;
    const primary = display ?? skill;
    if (primary === undefined) return null;
    const displayBreakdown = displayDetails(display, skill);
    const details = [...displayBreakdown.details];
    if (efficiency.power_score !== undefined && different(efficiency.power_score, primary)) {
      details.push({ label: "总充能", value: percent(efficiency.power_score) });
    }
    return {
      primaryLabel: display !== undefined ? "展示效率" : "充能效率",
      primaryValue: percent(primary),
      includesCrossStation: displayBreakdown.includesCrossStation,
      details,
    };
  }

  return null;
}

export function profileEfficiency(snapshot: UserProfileComboSnapshot): number | undefined {
  return snapshot.final_efficiency ?? snapshot.score ?? snapshot.trade_pct;
}

export function manufacturePoolReady(summary: UserProfileSummary): number | undefined {
  return summary.manufacture_pool_ready ?? summary.manu_pool_ready;
}
