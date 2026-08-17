// 基建技能房间标签：技能 id 第一个下划线之前就是房间前缀，
// 例如 control_tra_spd_000 → control → 控制中枢。无依赖，可被页面/组件/测试直接复用。

export type BuildingRoomPrefix =
  | "control"
  | "power"
  | "manu"
  | "trade"
  | "dorm"
  | "hire"
  | "meet"
  | "train"
  | "workshop";

export const BUILDING_ROOM_LABELS: Readonly<Record<BuildingRoomPrefix, string>> = {
  control: "控制中枢",
  power: "发电站",
  manu: "制造站",
  trade: "贸易站",
  dorm: "宿舍",
  hire: "办公室",
  meet: "会客室",
  train: "训练室",
  workshop: "加工站",
};

// 按用户在页面上希望展示的顺序排列，同时驱动标签栏。
export const BUILDING_ROOM_PREFIXES: readonly BuildingRoomPrefix[] = [
  "control",
  "power",
  "manu",
  "trade",
  "dorm",
  "hire",
  "meet",
  "train",
  "workshop",
];

const BUILDING_ROOM_PREFIX_SET = new Set<string>(BUILDING_ROOM_PREFIXES);

export function buildingRoomPrefixForSkillId(skillId: string): BuildingRoomPrefix | null {
  const prefix = skillId.split("_", 1)[0] ?? "";
  return BUILDING_ROOM_PREFIX_SET.has(prefix) ? (prefix as BuildingRoomPrefix) : null;
}

export interface OperatorWithSkills {
  name: string;
  buildingSkills: readonly { id: string }[];
}

export function operatorMatchesRooms(
  skillIds: readonly string[],
  rooms: readonly BuildingRoomPrefix[],
): boolean {
  if (rooms.length === 0) return true;
  const operatorRooms = new Set<BuildingRoomPrefix>();
  for (const id of skillIds) {
    const prefix = buildingRoomPrefixForSkillId(id);
    if (prefix !== null) operatorRooms.add(prefix);
  }
  // 取交集：干员必须能覆盖所有已勾选的房间（如同时勾选发电站+制造站，两个都得能进）。
  return rooms.every((room) => operatorRooms.has(room));
}

export function operatorMatchesNameContains(name: string, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedQuery) return true;
  return name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
}

export function filterOperators<T extends OperatorWithSkills>(
  operators: readonly T[],
  rooms: readonly BuildingRoomPrefix[],
  query: string,
): T[] {
  return operators
    .filter((operator) => {
      const skillIds = operator.buildingSkills.map((skill) => skill.id);
      return operatorMatchesRooms(skillIds, rooms) && operatorMatchesNameContains(operator.name, query);
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}
