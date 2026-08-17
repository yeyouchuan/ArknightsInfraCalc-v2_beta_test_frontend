import buildingSkillCatalogJson from "./generated/arkntools/building-skill-catalog.json" with { type: "json" };
import operatorCatalogJson from "./generated/arkntools/operator-catalog.json" with { type: "json" };

export interface OperatorBuildingSkillRef {
  index: number;
  id: string;
  elite: number;
  level: number;
}

export interface OperatorAssetRecord {
  id: string;
  name: string;
  rarity: number;
  profession: number;
  position: number;
  portrait: string;
  buildingSkills: OperatorBuildingSkillRef[];
}

interface BuildingSkillRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface BuildingSkillPresentation extends BuildingSkillRecord {
  index: number;
  elite: number;
  level: number;
  /** 该技能是否为同前缀（最后一个下划线之前）另一技能的提升版（组内 index 最大）。 */
  enhanced?: boolean;
}

/** 技能 id 的前缀：最后一个下划线之前的部分（如 train_spd&profession_020 → train_spd&profession）。 */
export function buildingSkillPrefixFor(skillId: string): string {
  const separator = skillId.lastIndexOf("_");
  return separator < 0 ? "" : skillId.slice(0, separator);
}

/**
 * 判定某个基建技能是否为同干员另一技能的提升版：
 * 按「最后一个下划线之前」的前缀分组，同前缀且数量 ≥2 时，除 index 最小者外都是提升版。
 * 两阶段时即较大的那个（如芙兰卡 train_spd&profession_020 / _021 → index 2 提升）；
 * 三阶段时（如赫拉格 dorm_rec_all&oneself_010/011/012）后两个都是提升。
 */
export function isBuildingSkillEnhanced(
  refs: readonly OperatorBuildingSkillRef[],
  ref: OperatorBuildingSkillRef,
): boolean {
  const prefix = buildingSkillPrefixFor(ref.id);
  if (!prefix) return false;
  let groupCount = 0;
  let minIndex = Infinity;
  for (const candidate of refs) {
    if (buildingSkillPrefixFor(candidate.id) !== prefix) continue;
    groupCount += 1;
    if (candidate.index < minIndex) minIndex = candidate.index;
  }
  return groupCount >= 2 && ref.index !== minIndex;
}

/** 解锁/提升标签里“精英/等级”前缀部分（不含尾词），如 “精英 2 ”、初始场景为 “初始”。 */
export function buildingSkillUnlockPrefix(elite: number, level: number): string {
  if (elite === 0 && level === 1) return "初始";
  if (elite === 0) return `等级 ${level} `;
  if (level === 1) return `精英 ${elite} `;
  return `精英 ${elite} · 等级 ${level} `;
}

/** 强化技能的尾词（一图流配色），多个展示点共用一份以免措辞漂移。 */
export const BUILDING_SKILL_ENHANCED_WORD = "提升";

/** 完整的解锁条件文本；强化技能尾词为「提升」，否则为「解锁」。 */
export function buildingSkillUnlockLabel(elite: number, level: number, enhanced = false): string {
  return `${buildingSkillUnlockPrefix(elite, level)}${enhanced ? BUILDING_SKILL_ENHANCED_WORD : "解锁"}`;
}

/** 干员全部基建技能（按 index 升序，合并目录 + 解锁条件 + enhanced）；未知干员返回空数组。 */
export function operatorBuildingSkillList(name: string): BuildingSkillPresentation[] {
  const operator = operatorFor(name.trim());
  if (!operator) return [];
  return operator.buildingSkills
    .flatMap((ref) => {
      const record = BUILDING_SKILL_CATALOG[ref.id];
      if (!record) return [];
      return [
        {
          ...record,
          index: ref.index,
          elite: ref.elite,
          level: ref.level,
          enhanced: isBuildingSkillEnhanced(operator.buildingSkills, ref),
        },
      ];
    })
    .sort((left, right) => left.index - right.index);
}

export interface OperatorPresentation {
  operator?: OperatorAssetRecord;
  portrait?: string;
  buildingSkill?: BuildingSkillPresentation;
}

const OPERATOR_NAME_ALIASES: Readonly<Record<string, string>> = {
  "阿米娅(近卫)": "char_002_amiya",
  "阿米娅(医疗)": "char_002_amiya",
};

export const OPERATOR_CATALOG = operatorCatalogJson as OperatorAssetRecord[];

export const BUILDING_SKILL_CATALOG = buildingSkillCatalogJson as Record<string, BuildingSkillRecord>;
const OPERATOR_BY_ID = new Map(OPERATOR_CATALOG.map((operator) => [operator.id, operator]));
const OPERATOR_BY_NAME = new Map(OPERATOR_CATALOG.map((operator) => [operator.name, operator]));

function operatorFor(name: string, id?: string): OperatorAssetRecord | undefined {
  const normalizedId = id?.trim();
  if (normalizedId) {
    const byId = OPERATOR_BY_ID.get(normalizedId) ?? OPERATOR_BY_ID.get(`char_${normalizedId}`);
    if (byId) return byId;
  }

  const normalizedName = name.trim();
  const aliasId = OPERATOR_NAME_ALIASES[normalizedName];
  return (aliasId ? OPERATOR_BY_ID.get(aliasId) : undefined) ?? OPERATOR_BY_NAME.get(normalizedName);
}

export function operatorPresentationFor({
  name,
  id,
  skill,
}: {
  name: string;
  id?: string;
  skill?: number;
}): OperatorPresentation {
  const operator = operatorFor(name, id);
  if (!operator) return {};

  const skillRef = Number.isInteger(skill) && Number(skill) > 0
    ? operator.buildingSkills.find((candidate) => candidate.index === skill)
    : undefined;
  const skillRecord = skillRef ? BUILDING_SKILL_CATALOG[skillRef.id] : undefined;
  return {
    operator,
    portrait: operator.portrait,
    ...(skillRef && skillRecord
      ? {
          buildingSkill: {
            ...skillRecord,
            index: skillRef.index,
            elite: skillRef.elite,
            level: skillRef.level,
            enhanced: isBuildingSkillEnhanced(operator.buildingSkills, skillRef),
          },
        }
      : {}),
  };
}

export function operatorPortraitFor(name: string, id?: string): string | undefined {
  return operatorPresentationFor({ name, id }).portrait;
}

export const PROFESSION_LABELS: Readonly<Record<number, string>> = {
  1: "近卫",
  2: "狙击",
  3: "重装",
  4: "医疗",
  5: "辅助",
  6: "术师",
  7: "特种",
  8: "先锋",
};

export function operatorProfessionFor(name: string): number | undefined {
  return operatorFor(name.trim())?.profession;
}

export function operatorProfessionPresentation(
  name: string,
): { label: string; icon: string } | undefined {
  const profession = operatorProfessionFor(name);
  const label = profession !== undefined ? PROFESSION_LABELS[profession] : undefined;
  return label ? { label, icon: `/images/profession/${label}.webp` } : undefined;
}
