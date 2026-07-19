import type { MaaJson, MaaOperatorSlot, MaaRoom, MaaRooms, SklandInfrastructure, SklandInfrastructureGroup, ShiftComparison } from "./types";

const SKLAND_TO_MAA: Partial<Record<SklandInfrastructureGroup, string>> = {
  control: "control",
  trading: "trading",
  manufacture: "manufacture",
  power: "power",
  dormitory: "dormitory",
  meeting: "meeting",
  hire: "hire",
};

function operatorName(value: string | MaaOperatorSlot | null): string | null {
  if (typeof value === "string") return value.trim() || null;
  return value?.name?.trim() || null;
}

function roomNames(room: MaaRoom | undefined): string[] {
  return room?.operators?.flatMap((value) => {
    const name = operatorName(value);
    return name ? [name] : [];
  }) ?? [];
}

function locationKey(group: string, index: number): string {
  return `${group}:${index}`;
}

export function compareShifts(maaJson: MaaJson | undefined, infrastructure: SklandInfrastructure | undefined): ShiftComparison[] {
  if (!maaJson?.plans?.length || !infrastructure) return [];
  const tired = new Set(infrastructure.tiredOperators);
  const actualLocationByOperator = new Map<string, string>();

  for (const room of infrastructure.rooms) {
    const group = SKLAND_TO_MAA[room.group];
    if (!group) continue;
    const key = locationKey(group, room.index);
    const names = new Set(room.operators.map((operator) => operator.name));
    for (const name of names) actualLocationByOperator.set(name, key);
  }

  return maaJson.plans.map((plan, planIndex) => {
    const plannedLocationByOperator = new Map<string, string>();
    for (const [group, rooms] of Object.entries(plan.rooms) as [keyof MaaRooms, MaaRoom[] | undefined][]) {
      rooms?.forEach((room, index) => {
        for (const name of roomNames(room)) plannedLocationByOperator.set(name, locationKey(group, index));
      });
    }

    const matched: string[] = [];
    const missing: string[] = [];
    const misplaced: string[] = [];
    for (const [name, expectedLocation] of plannedLocationByOperator) {
      const actualLocation = actualLocationByOperator.get(name);
      if (actualLocation === expectedLocation) matched.push(name);
      else if (actualLocation) misplaced.push(name);
      else missing.push(name);
    }

    const unexpected = [...actualLocationByOperator.keys()].filter((name) => !plannedLocationByOperator.has(name));
    const tiredScheduled = [...plannedLocationByOperator.keys()].filter((name) => tired.has(name));
    const denominator = new Set([...plannedLocationByOperator.keys(), ...actualLocationByOperator.keys()]).size || 1;
    return {
      planIndex,
      score: Math.round((matched.length / denominator) * 100),
      matched: matched.sort(),
      missing: missing.sort(),
      unexpected: unexpected.sort(),
      misplaced: misplaced.sort(),
      tiredScheduled: tiredScheduled.sort(),
    };
  });
}

export function closestShift(comparisons: ShiftComparison[]): ShiftComparison | null {
  return comparisons.reduce<ShiftComparison | null>((best, item) => (!best || item.score > best.score ? item : best), null);
}
