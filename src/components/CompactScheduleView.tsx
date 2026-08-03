"use client";

import type { CSSProperties } from "react";

import {
  factoryRecipeFor,
  maxRoomLevel,
  tradeOrderFor,
} from "@/blueprint";
import { LevelDiamonds, OperatorSlot, roomVisualFor } from "@/components";
import { presentRoomEfficiency } from "@/efficiency";
import {
  COMPACT_AUXILIARY_WIDTHS,
  COMPACT_CARD_CLASS,
  COMPACT_COLUMN_CLASS,
  COMPACT_DORM_OPERATOR_AREA_CLASS,
  COMPACT_DORM_WRAPPER_CLASS,
  COMPACT_GRID_CLASS,
  COMPACT_HEADER_CLASS,
  COMPACT_OPERATOR_ROW_CLASS,
  COMPACT_POWER_CARD_CLASS,
  COMPACT_POWER_OPERATOR_ROW_CLASS,
  COMPACT_ROOM_BACKGROUND_CLASS,
  COMPACT_ROOM_BACKGROUND_STYLE,
  COMPACT_ROOM_TITLE_CLASS,
  compactFactoryAccent,
  compactTradeAccent,
  isCompactScheduleGroupVisible,
  roomGridTone,
  usesCompactHorizontalCard,
} from "@/schedule-view-presentation";
import type { RoomRow } from "@/schedule";
import type { BaseBlueprint, MaaPlan } from "@/types";

export interface CompactScheduleViewProps {
  rows: RoomRow[];
  layout: BaseBlueprint;
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  activeShift: number;
  activePlan?: MaaPlan;
  onIssue: (row: RoomRow) => void;
}

/** 布局宽度百分比，自己改数值 */
const GRID_LEFT_PCT = 55;   // 左大列宽度%
const GRID_RIGHT_PCT = 45;  // 右大列宽度%

function roomSlotCountFor(group: string) {
  if (group === "trading" || group === "manufacture") return 3;
  if (group === "meeting") return 2;
  if (group === "power" || group === "hire" || group === "processing") return 1;
  return 5;
}

function CompactRoomCard({
  row,
  layoutRoom,
  visual,
  efficiency,
  slots,
  currentMoraleByOperator,
  horizontal,
  className = "",
  style,
}: {
  row: RoomRow;
  layoutRoom: BaseBlueprint["rooms"][number] | undefined;
  visual: ReturnType<typeof roomVisualFor>;
  efficiency: ReturnType<typeof presentRoomEfficiency>;
  slots: (RoomRow["operatorSlots"][number] | undefined)[];
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  horizontal: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const isTrade = layoutRoom?.kind === "trade_post";
  const isFactory = layoutRoom?.kind === "factory";
  const isPower = row.group === "power";
  const gridTone = roomGridTone(row.group);
  const rowStyle = {
    "--room-accent": visual.accent,
    "--room-level": visual.level,
    "--room-grid-color": gridTone.color,
    "--room-grid-opacity": gridTone.opacity,
    "--room-grid-fade-start": gridTone.fadeStart,
  } as CSSProperties;

  const header = (
    <div className={COMPACT_HEADER_CLASS}>
      <span className="infra-room-accent h-5 w-1 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
      <span className={COMPACT_ROOM_TITLE_CLASS}>{row.title}</span>
      <LevelDiamonds
        level={row.level}
        maxLevel={layoutRoom ? maxRoomLevel(layoutRoom.kind) : row.level}
        variant="compact"
      />
        {isTrade ? (() => {
          const order = tradeOrderFor(layoutRoom!);
          const accent = compactTradeAccent(order);
          const label = order === "gold" ? "龙门商法" : order === "originium" ? "开采协力" : order;
          return (
            <div className={`ml-auto flex h-7 w-[90px] items-center justify-center rounded border px-2 text-xs ${accent}`}>
              {label}
            </div>
          );
        })() : isFactory ? (() => {
          const recipe = factoryRecipeFor(layoutRoom!);
          const accent = compactFactoryAccent(recipe);
          const label = recipe === "all" ? "自动选择" : recipe === "gold" ? "贵金属" : recipe === "battle_record" ? "作战记录" : recipe === "originium" ? "源石碎片" : recipe;
          return (
            <div className={`ml-auto flex h-7 w-[90px] items-center justify-center rounded border px-2 text-xs ${accent}`}>
              {label}
            </div>
          );
      })() : null}
    </div>
  );

  const efficiencyBlock = efficiency ? (
    <div>
      {isPower ? (
        <span className="infra-room-value font-technical text-sm font-semibold tabular-nums text-[var(--room-accent)]">{efficiency.primaryValue}</span>
      ) : row.group === "trading" || row.group === "manufacture" ? (
        <div className="font-technical flex flex-wrap items-center gap-x-1.5 text-xs tracking-[0.01em] text-white/76">
          <span className="infra-room-value font-semibold tabular-nums text-[var(--room-accent)]">{efficiency.primaryValue}</span>
          {efficiency.details.map((detail) => (
            <span key={detail.label} className={detail.kind === "cross-station" ? "text-[#C8F75A]" : undefined}>
              / {detail.label} {detail.value}
            </span>
          ))}
        </div>
      ) : (
        <span className="font-technical text-sm tabular-nums text-white/66">{efficiency.primaryValue}</span>
      )}
    </div>
  ) : null;
  const emptyWorkstationState = !efficiency && (row.group === "trading" || row.group === "manufacture") ? (
    <div className="font-technical text-xs tracking-[0.01em] text-white/38">
      等待排班
    </div>
  ) : null;
  const efficiencyContent = efficiencyBlock ?? emptyWorkstationState;

  const operators = slots.map((slot, index) => (
    <OperatorSlot
      key={`${slot?.name ?? "empty"}-${index}`}
      slot={slot}
      currentMorale={slot ? currentMoraleByOperator?.get(slot.name) : undefined}
      autofill={row.group === "dormitory" && row.autofill}
      compactView
    />
  ));

  const backgroundLayers = (
    <>
      <div
        className={COMPACT_ROOM_BACKGROUND_CLASS}
        style={{
          ...COMPACT_ROOM_BACKGROUND_STYLE,
          backgroundImage: `url(${visual.background})`,
        }}
        aria-hidden="true"
      />
    </>
  );

  if (horizontal) {
    return (
      <div className={`${COMPACT_POWER_CARD_CLASS} ${className}`} style={{ ...rowStyle, ...style }}>
        {backgroundLayers}
        <div className="relative z-10 min-w-0">
          {header}
          <div className="mt-2">{efficiencyContent}</div>
        </div>
        <div className={`relative z-10 ${COMPACT_POWER_OPERATOR_ROW_CLASS}`}>
          {operators}
        </div>
      </div>
    );
  }

  return (
    <div className={`${COMPACT_CARD_CLASS} ${className}`} style={{ ...rowStyle, ...style }}>
      {backgroundLayers}
      <div className="relative z-10">{header}</div>
      {efficiencyContent ? (
        <div className="relative z-10">{efficiencyContent}</div>
      ) : null}
      <div
        className={`relative z-10 ${
          row.group === "dormitory" ? COMPACT_DORM_OPERATOR_AREA_CLASS : ""
        }`}
      >
        <div className={COMPACT_OPERATOR_ROW_CLASS}>{operators}</div>
      </div>
    </div>
  );
}

export function CompactScheduleView(props: CompactScheduleViewProps) {
  const { rows, layout, currentMoraleByOperator } = props;

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        没有可展示的布局房间。
      </div>
    );
  }

  const byGroup = new Map<string, RoomRow[]>();
  for (const row of rows) {
    if (!isCompactScheduleGroupVisible(row.group)) continue;
    const list = byGroup.get(row.group) ?? [];
    list.push(row);
    byGroup.set(row.group, list);
  }
  const getGroup = (group: string) => byGroup.get(group) ?? [];

  const workstations = [...getGroup("trading"), ...getGroup("manufacture")];
  const power = getGroup("power");
  const dorms = getGroup("dormitory");
  const powerCount = power.length;

  function makeCard(row: RoomRow, widthPercent?: number) {
    const layoutRoom = layout.rooms.find((r) => r.id === row.roomId);
    const visual = roomVisualFor(row.group);
    const efficiency = presentRoomEfficiency(row.group, row.efficiency);
    const slotCount = roomSlotCountFor(row.group);
    const slots = Array.from({ length: slotCount }, (_, i) => row.operatorSlots[i]);
    return (
      <CompactRoomCard
        key={row.key}
        row={row}
        layoutRoom={layoutRoom!}
        visual={visual}
        efficiency={efficiency}
        slots={slots}
        currentMoraleByOperator={currentMoraleByOperator}
        horizontal={usesCompactHorizontalCard(row.group, powerCount)}
        className="min-w-0"
        style={widthPercent !== undefined ? { flexBasis: `${widthPercent}%` } : { flex: 1 }}
      />
    );
  }

  const ctrl = getGroup("control")[0];
  const meeting = getGroup("meeting")[0];
  const office = getGroup("hire")[0];
  const processing = getGroup("processing")[0];

  return (
    <div className={COMPACT_GRID_CLASS}>
      <div
        className={COMPACT_COLUMN_CLASS}
        style={{ flexBasis: `${GRID_LEFT_PCT}%` }}
      >
        <div>{ctrl && makeCard(ctrl)}</div>

        {[0, 2, 4].map((start) => (
          <div key={start} className="flex justify-between gap-3">
            {workstations[start] && makeCard(workstations[start], 50)}
            {workstations[start + 1] && makeCard(workstations[start + 1], 50)}
          </div>
        ))}

        {powerCount === 3 ? (
          <div className="flex items-start justify-between gap-3">
            {power.slice(0, 3).map((p) => makeCard(p, 33))}
          </div>
        ) : (
          <div className="flex justify-between gap-3">
            <div className="flex justify-between gap-3" style={{ flexBasis: "50%" }}>
              {power[0] && makeCard(power[0])}
              {power[1] && makeCard(power[1])}
            </div>
            {workstations[6] && makeCard(workstations[6], 50)}
          </div>
        )}
      </div>

      <div
        className={COMPACT_COLUMN_CLASS}
        style={{ flexBasis: `${GRID_RIGHT_PCT}%` }}
      >
        <div className="flex items-stretch justify-between gap-3">
          {meeting && makeCard(meeting, COMPACT_AUXILIARY_WIDTHS.meeting)}
          {office && makeCard(office, COMPACT_AUXILIARY_WIDTHS.hire)}
          {processing && makeCard(processing, COMPACT_AUXILIARY_WIDTHS.processing)}
        </div>

        {dorms.slice(0, 4).map((dorm) => (
          <div key={dorm.key} className={COMPACT_DORM_WRAPPER_CLASS}>
            {makeCard(dorm)}
          </div>
        ))}
      </div>
    </div>
  );
}
