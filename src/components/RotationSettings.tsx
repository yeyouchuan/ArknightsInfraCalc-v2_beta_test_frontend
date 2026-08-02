"use client";

import { Clock3 } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ROTATION_OPTIONS,
  rotationOption,
} from "../rotation-settings";
import type { RotationProfile } from "../types";

type RotationSettingsProps = {
  value: RotationProfile;
  onChange: (value: RotationProfile) => void;
};

export function RotationSettings({ value, onChange }: RotationSettingsProps) {
  const selected = rotationOption(value);
  const cycleHours = selected.durations.reduce((total, duration) => total + duration, 0);

  return (
    <section aria-labelledby="rotation-settings-title" className="rounded-lg bg-muted/45 p-3">
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 id="rotation-settings-title" className="text-sm font-semibold">换班设置</h4>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">选择当前求解器支持的固定换班方案。</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Label htmlFor="rotation-profile" className="text-xs text-muted-foreground">换班方式</Label>
        <Select value={value} onValueChange={(profile) => onChange(profile as RotationProfile)}>
          <SelectTrigger id="rotation-profile" className="min-h-11 w-full bg-background" aria-label="换班方式">
            <SelectValue>{selected.label}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {ROTATION_OPTIONS.map((option) => (
              <SelectItem key={option.profile} value={option.profile}>
                {option.label} · {option.durations.join("/")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="班次时长">
        {selected.durations.map((duration, index) => (
          <span key={`${index}-${duration}`} className="rounded-md bg-background px-2 py-1 text-xs tabular-nums shadow-xs">
            第 {index + 1} 班 {duration}h
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">完整循环 {cycleHours} 小时</p>
    </section>
  );
}
