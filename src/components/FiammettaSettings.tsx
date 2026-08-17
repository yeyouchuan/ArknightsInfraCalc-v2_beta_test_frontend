"use client";

import { useMemo, useState } from "react";
import { Check, HeartPulse, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { operatorBuildingSkillList, operatorPortraitFor } from "@/operatorPortraits";
import { isFiammettaTargetAvailable } from "@/fiammetta-settings";
import type { OperBoxEntry } from "@/types";

type FiammettaSettingsProps = {
  enabled: boolean;
  target: string | null;
  order: "pre" | "post";
  operbox: OperBoxEntry[] | null;
  scheduledOperators: ReadonlySet<string>;
  onEnabledChange: (enabled: boolean) => void;
  onTargetChange: (target: string) => void;
  onOrderChange: (order: "pre" | "post") => void;
};

export function FiammettaSettings({ enabled, target, order, operbox, scheduledOperators, onEnabledChange, onTargetChange, onOrderChange }: FiammettaSettingsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ownsFiammetta = Boolean(operbox?.some((operator) => operator.own && operator.name === "菲亚梅塔"));
  const candidates = useMemo(() => (operbox ?? [])
    .filter((operator) => operator.own && scheduledOperators.has(operator.name) && operatorBuildingSkillList(operator.name).length > 0)
    .map((operator) => ({ ...operator, portrait: operatorPortraitFor(operator.name, operator.id) }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN")), [operbox, scheduledOperators]);
  const filtered = candidates.filter((operator) => operator.name.includes(query.trim())).slice(0, 120);
  const selected = candidates.find((operator) => operator.name === target);
  const targetUnavailable = enabled && Boolean(target) && !isFiammettaTargetAvailable(target, new Set(candidates.map((operator) => operator.name)));
  const unavailableReason = !ownsFiammetta
    ? "当前 Box 未拥有菲亚梅塔"
    : !scheduledOperators.size
      ? "请先生成一次排班，再选择实际工作的目标干员"
      : !candidates.length
        ? "当前排班没有可用的恢复心情目标"
        : null;

  function toggleEnabled() {
    const next = !enabled;
    onEnabledChange(next);
    if (next && !target) setOpen(true);
  }

  return (
    <section className="grid gap-3" aria-labelledby="fiammetta-settings-title">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 id="fiammetta-settings-title" className="text-sm font-semibold">菲亚梅塔恢复心情</h3>
          <p className="mt-1 text-xs text-muted-foreground">启用后写入导出的 MAA 排班。</p>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          disabled={Boolean(unavailableReason)}
          className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
          onClick={toggleEnabled}
        >
          <span className={`grid size-5 place-items-center border transition-colors ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
            {enabled ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </span>
          {enabled ? "已启用" : "未启用"}
        </button>
      </div>

      {unavailableReason ? <p className="text-xs text-amber-700" role="status">{unavailableReason}</p> : null}
      {targetUnavailable ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          <span>当前目标已不在生成的排班中，请重新选择恢复心情的干员。</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>重新选择</Button>
        </div>
      ) : null}

      {enabled ? (
        <div className="grid gap-3 border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
          <div className="size-14 shrink-0 overflow-hidden border border-border bg-[#272A2B]">
            {selected?.portrait ? <img src={selected.portrait} alt="" className="size-full object-cover" /> : <HeartPulse className="m-4 size-6 text-muted-foreground" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">恢复心情目标</span>
            <strong className="mt-1 block truncate text-base">{target || "尚未选择"}</strong>
          </div>
          <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => setOpen(true)} disabled={!candidates.length}>
            选择干员
          </Button>
          </div>
          <div className="grid grid-cols-2 gap-1" aria-label="菲亚梅塔执行时机">
            <Button type="button" size="sm" variant={order === "pre" ? "default" : "outline"} onClick={() => onOrderChange("pre")}>换班前</Button>
            <Button type="button" size="sm" variant={order === "post" ? "default" : "outline"} onClick={() => onOrderChange("post")}>换班后</Button>
          </div>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <DialogContent className="max-h-[min(760px,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-[min(780px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>选择恢复心情的目标干员</DialogTitle>
            <DialogDescription>仅显示当前排班中实际工作、已拥有且具备基建技能的干员，至多选择一名。</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索干员" className="h-11 pl-9" autoFocus />
            </div>
          </DialogBody>
          <ScrollArea className="min-h-0" viewportClassName="overflow-x-hidden">
            <div className="px-5 sm:px-7">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2 pb-2">
              {filtered.map((operator) => (
                <button
                  key={operator.id}
                  type="button"
                  className={`group grid min-w-0 gap-1 border p-1.5 text-center transition-colors hover:border-primary hover:bg-muted/50 ${target === operator.name ? "border-primary bg-primary/8" : "border-border bg-background"}`}
                  onClick={() => { onTargetChange(operator.name); setOpen(false); setQuery(""); }}
                >
                  <span className="mx-auto block aspect-square w-full max-w-20 overflow-hidden bg-[#272A2B]">
                    {operator.portrait ? <img src={operator.portrait} alt="" className="size-full object-cover" /> : null}
                  </span>
                  <span className="truncate text-xs font-medium" title={operator.name}>{operator.name}</span>
                </button>
              ))}
            </div>
            {!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的干员</p> : null}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
