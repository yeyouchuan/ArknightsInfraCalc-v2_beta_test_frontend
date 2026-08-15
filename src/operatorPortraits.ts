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

const BUILDING_SKILL_CATALOG = buildingSkillCatalogJson as Record<string, BuildingSkillRecord>;
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
          },
        }
      : {}),
  };
}

export function operatorPortraitFor(name: string, id?: string): string | undefined {
  return operatorPresentationFor({ name, id }).portrait;
}

export function operatorBuildingSkillsFor(operator: OperatorAssetRecord): BuildingSkillPresentation[] {
  return operator.buildingSkills.flatMap((skillRef) => {
    const skill = BUILDING_SKILL_CATALOG[skillRef.id];
    return skill
      ? [{
          ...skill,
          index: skillRef.index,
          elite: skillRef.elite,
          level: skillRef.level,
        }]
      : [];
  });
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
  return label ? { label, icon: `/images/profession/${label}.png` } : undefined;
}
