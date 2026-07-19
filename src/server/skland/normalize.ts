import type { AppBindingList, BuildingRoom, PlayerInfo, ResidentCharacter } from "skland-kit";

import { buildBlueprint, PRESETS } from "@/blueprint";
import type {
  BaseBlueprint,
  OperBoxEntry,
  SklandInfrastructure,
  SklandInfrastructureGroup,
  SklandInfrastructureOperator,
  SklandInfrastructureRoom,
  SklandRole,
  SklandSnapshot,
} from "@/types";

const MORALE_DIVISOR = 360_000;
const GOLD_ITEM_ID = "3003";
const ORIGINIUM_SHARD_ITEM_ID = "3141";
const BATTLE_RECORD_ITEM_IDS = new Set(["2001", "2002", "2003", "2004"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nameFor(info: PlayerInfo, charId: string | undefined): string | null {
  if (!charId) return null;
  return info.charInfoMap[charId]?.name?.trim() || null;
}

function normalizeResident(info: PlayerInfo, resident: ResidentCharacter): SklandInfrastructureOperator | null {
  const name = nameFor(info, resident.charId);
  if (!name) return null;
  return {
    id: resident.charId,
    name,
    morale: Math.round(clamp(resident.ap / MORALE_DIVISOR, 0, 24) * 10) / 10,
  };
}

function room(
  info: PlayerInfo,
  group: SklandInfrastructureGroup,
  index: number,
  value: BuildingRoom,
  product?: string,
  production?: SklandInfrastructureRoom["production"]
): SklandInfrastructureRoom {
  return {
    key: value.slotId || `${group}-${index + 1}`,
    group,
    index,
    level: value.level,
    product,
    production,
    operators: (value.chars ?? []).flatMap((resident) => {
      const normalized = normalizeResident(info, resident);
      return normalized ? [normalized] : [];
    }),
  };
}

export function rolesFromBinding(binding: AppBindingList): SklandRole[] {
  const game = binding.list.find((item) => item.appCode === "arknights");
  if (!game) return [];
  return game.bindingList
    .filter((item) => Boolean(item.uid) && !item.isDelete)
    .map((item) => ({
      uid: item.uid,
      nickname: item.nickName,
      channelName: item.channelName,
      isDefault: item.isDefault || item.uid === game.defaultUid,
    }));
}

export function operboxFromPlayerInfo(info: PlayerInfo): { operbox: OperBoxEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const operbox = info.chars.flatMap<OperBoxEntry>((character) => {
    if (seen.has(character.charId)) return [];
    seen.add(character.charId);
    const name = nameFor(info, character.charId);
    const elite = Number(character.evolvePhase);
    const level = Number(character.level);
    const potential = Number(character.potentialRank) + 1;
    const rarity = Number(character.rarity) + 1;
    if (!name || !Number.isInteger(elite) || elite < 0 || elite > 2 || !Number.isInteger(level) || level < 1 || level > 90 || !Number.isInteger(potential) || potential < 1 || potential > 6 || !Number.isInteger(rarity) || rarity < 1 || rarity > 6) {
      warnings.push(`干员 ${name || character.charId} 的森空岛练度字段不完整，已跳过。`);
      return [];
    }
    return [{ id: character.charId, name, elite, level, own: true, potential, rarity }];
  });
  return { operbox, warnings };
}

function factoryProduct(info: PlayerInfo, formulaId: string | number): "gold" | "battle_record" | "originium" | null {
  const formula = info.manufactureFormulaInfoMap[Number(formulaId)];
  const itemId = String(formula?.itemId ?? "");
  if (itemId === GOLD_ITEM_ID) return "gold";
  if (BATTLE_RECORD_ITEM_IDS.has(itemId)) return "battle_record";
  if (itemId === ORIGINIUM_SHARD_ITEM_ID) return "originium";
  return null;
}

function layoutSuggestion(info: PlayerInfo): {
  layoutLabel: SklandInfrastructure["layoutLabel"];
  layoutSuggestion: BaseBlueprint | null;
  layoutWarning: string | null;
} {
  const building = info.building;
  const preset = PRESETS.find(
    (item) => item.trading === building.tradings.length && item.manufacture === building.manufactures.length && item.power === building.powers.length
  );
  if (!preset) {
    return {
      layoutLabel: null,
      layoutSuggestion: null,
      layoutWarning: `森空岛布局为 ${building.tradings.length} 贸易 / ${building.manufactures.length} 制造 / ${building.powers.length} 发电，当前预设暂不支持。`,
    };
  }

  const layout = buildBlueprint(preset);
  const groups = {
    trade_post: building.tradings,
    factory: building.manufactures,
    power_plant: building.powers,
    dormitory: building.dormitories,
  };
  const counters = new Map<string, number>();
  layout.rooms = layout.rooms.map((existing) => {
    if (existing.kind === "control_center") return { ...existing, level: building.control.level };
    if (existing.kind === "meeting_room" && building.meeting) return { ...existing, level: building.meeting.level };
    if (existing.kind === "office" && building.hire) return { ...existing, level: building.hire.level };
    if (!(existing.kind in groups)) return existing;
    const index = counters.get(existing.kind) ?? 0;
    counters.set(existing.kind, index + 1);
    if (existing.kind === "trade_post") {
      const source = building.tradings[index];
      if (!source) return existing;
      return { ...existing, level: source.level, product: { trade: { order: source.strategy === "O_DIAMOND" ? "originium" : "gold" } } };
    }
    if (existing.kind === "factory") {
      const source = building.manufactures[index];
      if (!source) return existing;
      const recipe = factoryProduct(info, source.formulaId);
      return recipe ? { ...existing, level: source.level, product: { factory: { recipe } } } : { ...existing, level: source.level };
    }
    const source = groups[existing.kind as "power_plant" | "dormitory"][index];
    if (!source) return existing;
    return { ...existing, level: source.level };
  });

  return { layoutLabel: preset.label, layoutSuggestion: layout, layoutWarning: null };
}

export function infrastructureFromPlayerInfo(info: PlayerInfo): SklandInfrastructure {
  const building = info.building;
  const rooms: SklandInfrastructureRoom[] = [
    room(info, "control", 0, building.control),
    ...building.tradings.map((value, index) => room(info, "trading", index, value, value.strategy, {
      stock: value.stock.length,
      capacity: value.stockLimit,
      completed: null,
      remaining: null,
      completeWorkTime: value.completeWorkTime || null,
    })),
    ...building.manufactures.map((value, index) => room(info, "manufacture", index, value, factoryProduct(info, value.formulaId) ?? undefined, {
      stock: value.weight,
      capacity: value.capacity,
      completed: value.complete,
      remaining: value.remain,
      completeWorkTime: value.completeWorkTime || null,
    })),
    ...building.powers.map((value, index) => room(info, "power", index, value)),
    ...building.dormitories.map((value, index) => room(info, "dormitory", index, value)),
    ...(building.meeting ? [room(info, "meeting", 0, building.meeting)] : []),
    ...(building.hire ? [room(info, "hire", 0, building.hire)] : []),
  ];
  const training = building.training
    ? {
        trainee: nameFor(info, building.training.trainee?.charId),
        trainer: nameFor(info, building.training.trainer?.charId),
        remainSecs: Math.max(0, Number(building.training.remainSecs) || 0),
      }
    : null;
  const suggestion = layoutSuggestion(info);
  return {
    currentTs: info.currentTs,
    storeTs: info.status.storeTs,
    ...suggestion,
    rooms,
    tiredOperators: building.tiredChars.flatMap((value) => {
      const name = nameFor(info, value.charId);
      return name ? [name] : [];
    }),
    labor: {
      value: building.labor.value,
      maxValue: building.labor.maxValue,
      remainSecs: Math.max(0, building.labor.remainSecs),
    },
    training,
  };
}

export function snapshotFromPlayerInfo(info: PlayerInfo, roles: SklandRole[], selectedUid: string): SklandSnapshot {
  const role = roles.find((item) => item.uid === selectedUid) ?? roles[0];
  const { operbox, warnings } = operboxFromPlayerInfo(info);
  const infrastructure = infrastructureFromPlayerInfo(info);
  if (infrastructure.layoutWarning) warnings.push(infrastructure.layoutWarning);
  return {
    player: {
      uid: info.status.uid,
      nickname: info.status.name || role?.nickname || selectedUid,
      level: info.status.level,
      channelName: role?.channelName ?? "未知渠道",
      storeTs: info.status.storeTs,
      lastOnlineTs: info.status.lastOnlineTs,
    },
    roles,
    operbox,
    infrastructure,
    sourceName: `skland:${selectedUid}:${info.status.storeTs}`,
    warnings,
  };
}
