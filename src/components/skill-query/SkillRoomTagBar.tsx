"use client";

import { X } from "lucide-react";

import {
  BUILDING_ROOM_LABELS,
  BUILDING_ROOM_PREFIXES,
  type BuildingRoomPrefix,
} from "@/building-rooms";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface SkillRoomTagBarProps {
  selected: readonly BuildingRoomPrefix[];
  onChange: (next: readonly BuildingRoomPrefix[]) => void;
}

// 选中态：黄色填充 + 深色文字 + 黄色描边，与未选中的描边态拉开对比。
// Base UI 的 Toggle 用 aria-pressed（不是 data-state=on），所以用 aria-pressed: 前缀；
// hover 时也保持选中色，避免被 toggleVariants 的 hover:bg-muted 覆盖。
const SELECTED_TAG_CLASS =
  "aria-pressed:border-[#FFD800] aria-pressed:bg-[#FFD800] aria-pressed:text-[#313131] aria-pressed:hover:bg-[#FFD800] aria-pressed:hover:text-[#313131]";

export function SkillRoomTagBar({ selected, onChange }: SkillRoomTagBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="房间筛选">
      <ToggleGroup
        multiple
        value={selected}
        onValueChange={(next) => onChange(next as readonly BuildingRoomPrefix[])}
        variant="outline"
        size="sm"
        spacing={2}
        aria-label="房间筛选"
        className="w-full flex-wrap"
      >
        {BUILDING_ROOM_PREFIXES.map((prefix) => (
          <ToggleGroupItem
            key={prefix}
            value={prefix}
            aria-label={`筛选${BUILDING_ROOM_LABELS[prefix]}`}
            className={SELECTED_TAG_CLASS}
          >
            {BUILDING_ROOM_LABELS[prefix]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={selected.length === 0}
        onClick={() => onChange([])}
        aria-label="清除房间选择"
      >
        <X aria-hidden="true" />
        清除选择
      </Button>
    </div>
  );
}
