import type { RoomGroup, RoomRow } from "./schedule";

export interface ListScheduleGroup {
  label: string;
  rows: RoomRow[];
}

const LIST_FUNCTIONAL_FACILITY_GROUPS = new Set<RoomGroup>([
  "hire",
  "power",
  "meeting",
  "processing",
]);

const LIST_ALIGNED_OPERATOR_ORIGIN_GROUPS = new Set<RoomGroup>([
  "control",
  "trading",
  "manufacture",
  "dormitory",
]);

const LIST_FUNCTIONAL_FACILITY_ORDER: Partial<Record<RoomGroup, number>> = {
  power: 0,
  meeting: 1,
  hire: 2,
  processing: 3,
};

export const LIST_OPERATOR_ORIGIN_PX = 248;
export const LIST_OPERATOR_FRAME_SIZE_PX = 88;
export const LIST_OPERATOR_GAP_MAX_PX = 20;
export const LIST_FUNCTIONAL_GROUP_GAP_PX = 12;
export const LIST_MEETING_OPERATOR_WIDTH_PX =
  LIST_OPERATOR_FRAME_SIZE_PX * 2 + LIST_OPERATOR_GAP_MAX_PX;

const LIST_OPERATOR_COLUMN_GAP = "clamp(0.75rem, 1.25vw, 1.25rem)";
const LIST_FUNCTIONAL_GRID_CLASS =
  "xl:grid-cols-[repeat(24,minmax(0,1fr))]";
const LIST_FUNCTIONAL_OPERATOR_PLACEMENT_CLASS =
  "xl:absolute xl:inset-y-0";

export function isListFunctionalFacilityRoom(group: RoomGroup): boolean {
  return LIST_FUNCTIONAL_FACILITY_GROUPS.has(group);
}

export function listRoomUsesAlignedOperatorOrigin(group: RoomGroup): boolean {
  return LIST_ALIGNED_OPERATOR_ORIGIN_GROUPS.has(group);
}

export function listRoomHeightClass(group: RoomGroup): string {
  if (group === "manufacture") return "h-[160px]";
  if (isListFunctionalFacilityRoom(group)) return "h-[128px]";
  return "h-[144px]";
}

export function listRoomTitleSizeClass(): string {
  return "text-[18px] max-sm:text-[16px]";
}

export function listMobileOperatorGridClass(): string {
  return "max-sm:grid max-sm:w-full max-sm:max-w-[304px] max-sm:grid-cols-5 max-sm:[column-gap:0.375rem] max-sm:gap-y-2 max-sm:overflow-visible max-sm:pb-2";
}

export function listFunctionalOperatorPosition(
  group: RoomGroup,
): { columnGap: string; left: string } | undefined {
  if (!isListFunctionalFacilityRoom(group)) return undefined;

  return {
    columnGap: LIST_OPERATOR_COLUMN_GAP,
    left: group === "meeting"
      ? `max(0px, min(${LIST_OPERATOR_ORIGIN_PX}px, calc(100cqw - ${LIST_MEETING_OPERATOR_WIDTH_PX}px)))`
      : `max(0px, min(${LIST_OPERATOR_ORIGIN_PX}px, calc(100cqw - ${LIST_OPERATOR_FRAME_SIZE_PX}px)))`,
  };
}

export function listFunctionalOperatorPlacementClass(
  group: RoomGroup,
): string | undefined {
  return isListFunctionalFacilityRoom(group)
    ? LIST_FUNCTIONAL_OPERATOR_PLACEMENT_CLASS
    : undefined;
}

export function listFunctionalFacilityGridClass(): string {
  return LIST_FUNCTIONAL_GRID_CLASS;
}

export function listFunctionalRoomSpanClass(
  group: RoomGroup,
): string | undefined {
  if (group === "meeting") return "xl:col-span-12";
  if (group === "power" || group === "hire" || group === "processing") {
    return "xl:col-span-8";
  }
  return undefined;
}

export function buildListScheduleGroups(rows: RoomRow[]): ListScheduleGroup[] {
  const groups = rows.reduce<ListScheduleGroup[]>((currentGroups, row) => {
    const groupLabel = isListFunctionalFacilityRoom(row.group)
      ? "功能设施"
      : row.groupLabel;
    const group = currentGroups.find((item) => item.label === groupLabel);

    if (group) {
      group.rows.push(row);
    } else {
      currentGroups.push({ label: groupLabel, rows: [row] });
    }

    return currentGroups;
  }, []);

  const functionalGroup = groups.find((group) => group.label === "功能设施");
  const functionalPowerCount = functionalGroup?.rows.filter(
    (row) => row.group === "power",
  ).length ?? 0;
  const functionalFacilityOrder = functionalPowerCount === 2
    ? {
        ...LIST_FUNCTIONAL_FACILITY_ORDER,
        hire: 1,
        meeting: 2,
      }
    : LIST_FUNCTIONAL_FACILITY_ORDER;
  functionalGroup?.rows.sort(
    (left, right) =>
      (functionalFacilityOrder[left.group] ?? Number.MAX_SAFE_INTEGER)
      - (functionalFacilityOrder[right.group] ?? Number.MAX_SAFE_INTEGER),
  );

  return groups;
}
