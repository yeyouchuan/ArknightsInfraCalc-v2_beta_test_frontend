const ROOM_KINDS = new Set([
  "control_center", "trade_post", "factory", "power_plant", "dormitory", "office", "meeting_room", "workshop",
]);

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function validateLayoutJson(value: unknown): string[] {
  if (!object(value)) return ["layout 必须是 JSON 对象。"];
  const errors: string[] = [];
  if (typeof value.template !== "string" || !value.template.trim()) errors.push("template 必须是非空字符串。");
  if (typeof value.drone_cap !== "number" || !Number.isFinite(value.drone_cap) || value.drone_cap < 0) errors.push("drone_cap 必须是非负数。");
  if (!object(value.scenario)) errors.push("scenario 必须是对象。");
  if (!Array.isArray(value.rooms) || value.rooms.length === 0) return [...errors, "rooms 必须是非空数组。"];

  const ids = new Set<string>();
  let controls = 0;
  let powerPlants = 0;
  value.rooms.forEach((room, index) => {
    const label = `rooms[${index}]`;
    if (!object(room)) return errors.push(`${label} 必须是对象。`);
    if (typeof room.id !== "string" || !room.id.trim()) errors.push(`${label}.id 必须是非空字符串。`);
    else if (ids.has(room.id)) errors.push(`房间 ID 重复：${room.id}。`);
    else ids.add(room.id);
    if (typeof room.kind !== "string" || !ROOM_KINDS.has(room.kind)) errors.push(`${label}.kind 不受支持。`);
    if (!Number.isInteger(room.level) || (room.level as number) < 1 || (room.level as number) > 3) errors.push(`${label}.level 必须是 1–3 的整数。`);
    if (room.kind === "control_center") controls += 1;
    if (room.kind === "power_plant") powerPlants += 1;
    if (room.kind === "trade_post") {
      const trade = object(room.product) && object(room.product.trade) ? room.product.trade : null;
      if (!trade || !["gold", "originium"].includes(String(trade.order))) errors.push(`${label} 缺少有效贸易订单。`);
    }
    if (room.kind === "factory") {
      const factory = object(room.product) && object(room.product.factory) ? room.product.factory : null;
      if (!factory || !["gold", "battle_record", "originium"].includes(String(factory.recipe))) errors.push(`${label} 缺少有效制造配方。`);
    }
    if (room.kind === "dormitory" && room.dorm_beds !== undefined && (!Number.isInteger(room.dorm_beds) || (room.dorm_beds as number) < 1 || (room.dorm_beds as number) > 5)) {
      errors.push(`${label}.dorm_beds 必须是 1–5 的整数。`);
    }
  });
  if (controls !== 1) errors.push(`布局必须且只能包含一个控制中枢（当前 ${controls} 个）。`);
  if (powerPlants === 0) errors.push("布局至少需要一个发电站。");
  return errors;
}
