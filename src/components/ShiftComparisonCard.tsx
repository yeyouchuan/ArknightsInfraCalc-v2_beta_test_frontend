"use client";

import { cn } from "@/lib/utils";
import type { ShiftComparison } from "@/types";

export function ShiftComparisonCard({ comparison }: { comparison: ShiftComparison | null }) {
  if (!comparison) return null;
  const groups = [
    { label: "需要换入", names: comparison.missing, tone: "text-sky-700" },
    { label: "需要换出", names: comparison.unexpected, tone: "text-amber-700" },
    { label: "位置不一致", names: comparison.misplaced, tone: "text-foreground" },
    { label: "疲劳但仍排入", names: comparison.tiredScheduled, tone: "text-destructive" },
  ] as const;
  return (
    <section className="mb-5 border-y border-primary/25 bg-primary/5 px-4 py-4 text-sm" aria-labelledby="closest-shift-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <span className="text-xs font-medium text-muted-foreground">当前状态匹配</span>
          <h3 id="closest-shift-title" className="mt-0.5 text-base font-semibold">
            当前最接近第 <span className="font-number">{comparison.planIndex + 1}</span> 班
          </h3>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">房间匹配</span>
          <strong className="ml-2 text-lg tabular-nums">{comparison.score}%</strong>
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden bg-border/70"
        role="progressbar"
        aria-label="房间匹配百分比"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={comparison.score}
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, comparison.score))}%` }}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 sm:grid-cols-4 sm:divide-y-0">
        {groups.map((group) => (
          <div key={group.label} className="px-3 py-2 first:pl-0 sm:first:pl-0">
            <dt className="text-xs text-muted-foreground">{group.label}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", group.tone)}>
              {group.names.length}
            </dd>
          </div>
        ))}
      </dl>
      <details className="mt-3 border-t border-border/70 pt-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline hover:underline-offset-4">
          查看具体干员
        </summary>
        <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.label} className="min-w-0 border-t border-border/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <strong className={cn("text-xs", group.tone)}>{group.label}</strong>
                <span className="text-xs tabular-nums text-muted-foreground">{group.names.length}</span>
              </div>
              <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground">
                {group.names.join("、") || "无"}
              </p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
