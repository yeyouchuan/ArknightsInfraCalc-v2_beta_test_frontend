"use client";

import { Activity, ArrowUpRight, BarChart3, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { AnimatedNumber, AnimatedText } from "@/components/AnimatedText";
import { ShiftComparisonDetails } from "@/components/ShiftComparisonCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { manufacturePoolReady, profileEfficiency } from "@/efficiency";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import { relativeMetricDelta, rotationMetricValue, type RotationMetricKind } from "@/rotation-presentation";
import type { BaseBlueprint, RotationJson, ShiftComparison, UserProfile } from "@/types";

type DetailSection = "efficiency" | "comparison";

function compactNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, "");
}

function severityClass(severity: "ok" | "warn" | "critical") {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function PlanResultSummary({
  profile,
  rotation,
  layout,
  activeShift,
  comparison,
  planRevision,
}: {
  profile?: UserProfile;
  rotation?: RotationJson;
  layout: BaseBlueprint;
  activeShift: number;
  comparison: ShiftComparison | null;
  planRevision?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [detailSection, setDetailSection] = useState<DetailSection>("efficiency");
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!profile && !rotation) return null;

  const currentRotation = profile?.rotation;
  const baselineRotation = profile?.baseline_rotation;
  const metrics = [
    { kind: "trade" as const, label: "24h 贸易", value: rotation?.daily.trade ?? currentRotation?.daily_trade_efficiency ?? currentRotation?.daily_trade, baseline: baselineRotation?.daily_trade_efficiency ?? baselineRotation?.daily_trade, suffix: "×" },
    { kind: "manu" as const, label: "24h 制造", value: rotation?.daily.manu ?? currentRotation?.daily_manufacture_efficiency ?? currentRotation?.daily_manu, baseline: baselineRotation?.daily_manufacture_efficiency ?? baselineRotation?.daily_manu, suffix: "%" },
    { kind: "power" as const, label: "24h 发电", value: rotation?.daily.power ?? currentRotation?.daily_power_efficiency ?? currentRotation?.daily_power, baseline: baselineRotation?.daily_power_efficiency ?? baselineRotation?.daily_power, suffix: "%" },
  ].filter((metric): metric is { kind: RotationMetricKind; label: string; value: number; baseline: number | undefined; suffix: string } => typeof metric.value === "number");
  const adjustmentCount = comparison?.adjustments.length ?? 0;
  const activeDetailSection = detailSection === "comparison" && comparison ? "comparison" : "efficiency";
  const openDetails = (section: DetailSection) => {
    setDetailSection(section);
    setDrawerOpen(true);
  };

  return (
    <>
      <motion.section
        className="relative mb-5 overflow-hidden border border-[#313131]/18 bg-[#F3F1EA] text-[#313131] shadow-[0_12px_30px_rgba(35,38,39,0.10)]"
        aria-label="排班结果摘要"
        data-plan-summary
        data-plan-result-summary
        data-plan-revision={planRevision}
        data-active-shift={activeShift}
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 14, scale: shouldReduceMotion ? 1 : 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
        transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.46, delay: shouldReduceMotion ? 0 : 0.04, ease: MOTION_EASE_OUT }}
      >
        <motion.span key={`accent-${planRevision}`} className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 origin-left bg-[#FFD501]" aria-hidden="true" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }} transition={{ duration: shouldReduceMotion ? 0 : 0.62, delay: shouldReduceMotion ? 0 : 0.08, times: [0, 0.15, 0.82, 1], ease: MOTION_EASE_OUT }} />
        <div key={planRevision} className="grid min-h-[84px] grid-cols-[minmax(10rem,1.15fr)_repeat(3,minmax(7.5rem,.82fr))_minmax(15rem,1.35fr)_auto] items-stretch max-[1120px]:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(7rem,.8fr))_auto] max-[820px]:grid-cols-4 max-sm:grid-cols-2">
          <motion.button type="button" className="group relative flex min-w-0 items-center justify-between gap-3 overflow-hidden bg-[#272A2B] px-5 py-3 text-left text-white focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#FFD800] max-sm:col-span-2 max-sm:min-h-16" data-plan-details-trigger="efficiency" whileHover={shouldReduceMotion ? undefined : { x: 2 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }} onClick={() => openDetails("efficiency")}>
            <motion.span className="min-w-0" data-plan-metric initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.36, delay: shouldReduceMotion ? 0 : 0.1, ease: MOTION_EASE_OUT }}>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/52"><Activity className="size-3 text-[#FFD501]" aria-hidden="true" />PLAN ONLINE</span>
              <strong className="mt-1 block truncate text-lg font-medium"><span className="font-number">{layout.template}</span> 基建方案</strong>
              <span className="mt-1 block text-[10px] text-white/45">点击查看完整效率诊断</span>
            </motion.span>
            <ChevronRight className="size-4 shrink-0 text-white/55 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </motion.button>

          {metrics.map((metric, index) => {
            const value = rotationMetricValue(metric.kind, metric.value);
            const digits = metric.kind === "trade" ? 3 : 1;
            const delta = typeof metric.baseline === "number" ? relativeMetricDelta(metric.value, metric.baseline) : undefined;
            return (
              <motion.button
                key={metric.kind}
                type="button"
                className={cn("group relative min-h-[84px] overflow-hidden border-r border-[#313131]/10 px-4 py-3 text-left transition-colors hover:bg-white/55 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary max-sm:min-h-[72px] max-sm:border-t", index === 2 && "max-sm:col-span-2")}
                data-plan-details-trigger="efficiency"
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                onClick={() => openDetails("efficiency")}
              >
                <motion.span
                  className="block"
                  data-plan-metric
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.36, delay: shouldReduceMotion ? 0 : 0.15 + index * 0.065, ease: MOTION_EASE_OUT }}
                >
                  <span className="font-number block text-[10px] font-medium uppercase tracking-[0.08em] text-[#313131]/52">{metric.label}</span>
                  <strong className="font-technical mt-0.5 block text-[clamp(1.05rem,1.55vw,1.35rem)] font-semibold leading-none tabular-nums"><AnimatedNumber value={`${compactNumber(value, digits)}${metric.suffix}`} drift={{ x: 0, y: shouldReduceMotion ? 0 : 8 }} trend={delta === undefined ? 0 : delta >= 0 ? 1 : -1} /></strong>
                  <span className={cn("mt-2 inline-flex items-center gap-1 text-[10px] font-semibold", delta === undefined ? "text-[#313131]/42" : delta >= 0 ? "text-emerald-700" : "text-red-700")}>
                    {delta === undefined ? "暂无参考" : <><ArrowUpRight className={cn("size-3", delta < 0 && "rotate-90")} aria-hidden="true" />{delta >= 0 ? "+" : ""}{compactNumber(delta)}%</>}
                  </span>
                </motion.span>
                <motion.span className={cn("absolute inset-x-0 bottom-0 h-0.5 origin-left", delta === undefined ? "bg-[#313131]/18" : delta >= 0 ? "bg-emerald-500" : "bg-red-500")} aria-hidden="true" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, delay: shouldReduceMotion ? 0 : 0.2 + index * 0.065, ease: MOTION_EASE_OUT }} />
              </motion.button>
            );
          })}

          {comparison ? (
            <motion.button type="button" className="min-w-0 bg-[#E7E3D8] px-4 py-3 text-left transition-colors hover:bg-[#DDD8CA] focus-visible:outline-2 focus-visible:outline-primary max-[1120px]:col-span-4 max-[1120px]:border-t max-md:col-span-3 max-sm:col-span-2 max-sm:min-h-14" data-shift-comparison data-plan-details-trigger="comparison" whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }} onClick={() => openDetails("comparison")}>
              <span className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">最接近第 <strong className="font-number"><AnimatedText value={comparison.planIndex + 1} /></strong> 班 · 匹配率 <strong className="font-number"><AnimatedText value={`${comparison.score}%`} /></strong></span>
                <span className="shrink-0 text-[#313131]/60">需调整 <strong className="font-number text-[#313131]"><AnimatedText value={adjustmentCount} /></strong> 处</span>
              </span>
              <span className="mt-1 block h-1 overflow-hidden bg-[#313131]/10" role="progressbar" aria-label="房间匹配百分比" aria-valuemin={0} aria-valuemax={100} aria-valuenow={comparison.score}>
                <motion.span
                  className="block h-full bg-primary"
                  initial={{ scaleX: shouldReduceMotion ? Math.max(0, Math.min(100, comparison.score)) / 100 : 0 }}
                  animate={{ scaleX: Math.max(0, Math.min(100, comparison.score)) / 100 }}
                  transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.content, ease: MOTION_EASE_OUT }}
                  style={{ transformOrigin: "left center" }}
                />
              </span>
            </motion.button>
          ) : null}

          <Button type="button" variant="ghost" size="sm" className="m-2 self-center whitespace-nowrap max-[820px]:col-start-4 max-sm:col-span-2 max-sm:col-start-auto max-sm:m-0 max-sm:min-h-12 max-sm:justify-between max-sm:border-t" data-plan-details-trigger="efficiency" data-motion-pressable onClick={() => openDetails("efficiency")}>
            <BarChart3 />查看详情
          </Button>
        </div>
      </motion.section>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="排班结果详情" description="核心效率与当前进驻状态的完整诊断。" width={560}>
        <Tabs value={activeDetailSection} onValueChange={(value) => setDetailSection(value as DetailSection)} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="w-full justify-start gap-1 border-b border-border/70 px-4 py-0" aria-label="结果详情分类">
            <TabsTrigger value="efficiency" className="min-h-11 flex-none px-3">效率详情</TabsTrigger>
            {comparison ? <TabsTrigger value="comparison" className="min-h-11 flex-none px-3">当前状态匹配</TabsTrigger> : null}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6" data-plan-details-section={activeDetailSection}>
            <TabsContent value="efficiency" className="m-0">
              <motion.div initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}>
                <EfficiencyDetails profile={profile} rotation={rotation} layout={layout} metrics={metrics} />
              </motion.div>
            </TabsContent>
            {comparison ? (
              <TabsContent value="comparison" className="m-0">
                <motion.div initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}>
                  <ShiftComparisonDetails comparison={comparison} />
                </motion.div>
              </TabsContent>
            ) : null}
          </div>
        </Tabs>
      </Drawer>
    </>
  );
}

function EfficiencyDetails({ profile, rotation, layout, metrics }: { profile?: UserProfile; rotation?: RotationJson; layout: BaseBlueprint; metrics: Array<{ kind: RotationMetricKind; label: string; value: number; baseline: number | undefined; suffix: string }> }) {
  const shouldReduceMotion = useReducedMotion();
  const summary = profile?.summary;
  const domains = profile?.domains ?? [];
  return (
    <section className="pt-4" aria-label="效率详情" data-efficiency-details>
      <div className="grid gap-2 sm:grid-cols-3" data-efficiency-insights>
        {metrics.map((metric, index) => {
          const digits = metric.kind === "trade" ? 3 : 1;
          const value = rotationMetricValue(metric.kind, metric.value);
          const baseline = typeof metric.baseline === "number" ? rotationMetricValue(metric.kind, metric.baseline) : undefined;
          const delta = typeof metric.baseline === "number" ? relativeMetricDelta(metric.value, metric.baseline) : undefined;
          return <motion.article key={metric.kind} className={cn("relative overflow-hidden border px-3 py-3", delta === undefined ? "border-border/70 bg-muted/25" : delta >= 0 ? "border-emerald-800/20 bg-emerald-50/55" : "border-red-800/20 bg-red-50/60")} data-insight-state={delta === undefined ? "neutral" : delta >= 0 ? "positive" : "negative"} initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.34, delay: shouldReduceMotion ? 0 : index * 0.055, ease: MOTION_EASE_OUT }}><span className={cn("absolute inset-y-0 left-0 w-0.5", delta === undefined ? "bg-[#313131]/25" : delta >= 0 ? "bg-emerald-500" : "bg-red-500")} aria-hidden="true" /><span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{metric.label}</span><strong className="font-technical mt-1 block text-2xl leading-none tabular-nums">{compactNumber(value, digits)}{metric.suffix}</strong><div className="mt-3 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground"><span>{baseline === undefined ? "暂无参考" : `参考 ${compactNumber(baseline, digits)}${metric.suffix}`}</span>{delta === undefined ? <span className="bg-muted px-1.5 py-0.5">趋势未知</span> : <b className={cn("px-1.5 py-0.5", delta >= 0 ? "bg-emerald-700 text-emerald-50" : "bg-red-700 text-red-50")}>{delta >= 0 ? "+" : ""}{compactNumber(delta)}%</b>}</div></motion.article>;
        })}
      </div>
      {summary ? <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-border/70 py-2 text-xs"><div className="flex gap-1"><dt className="text-muted-foreground">候选池</dt><dd className="font-number font-semibold">贸易 {summary.trade_pool_ready} · 制造 {manufacturePoolReady(summary) ?? "—"}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">中枢</dt><dd className="font-number font-semibold">Lv.{layout.rooms.find((room) => room.kind === "control_center")?.level ?? "—"}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">班次</dt><dd className="font-number font-semibold">{rotation?.shifts.length ?? 0}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">可用干员</dt><dd className="font-number font-semibold">{summary.owned} / 进阶 {summary.tier_up_owned}</dd></div></dl> : null}
      {domains.length ? <div className="mt-5 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">领域指标</h3><div className="mt-2 grid gap-1">{[...domains].sort((a, b) => ({ critical: 0, warn: 1, ok: 2 })[a.severity] - ({ critical: 0, warn: 1, ok: 2 })[b.severity]).map((domain) => { const current = profileEfficiency(domain.current); const baseline = profileEfficiency(domain.baseline); return <div key={domain.id} className="grid gap-2 border-b border-border/60 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><strong className="block truncate">{domain.label}</strong>{domain.current.operators.length ? <span className="mt-0.5 block text-muted-foreground">{domain.current.operators.join(" / ")}</span> : null}{domain.current.mechanic_equivalent_efficiency !== undefined || domain.baseline.mechanic_equivalent_efficiency !== undefined ? <span className="mt-1 block text-[10px] text-muted-foreground">机制等效 当前 {domain.current.mechanic_equivalent_efficiency === undefined ? "—" : compactNumber(domain.current.mechanic_equivalent_efficiency, 3)} · 参考 {domain.baseline.mechanic_equivalent_efficiency === undefined ? "—" : compactNumber(domain.baseline.mechanic_equivalent_efficiency, 3)}</span> : null}</div><div className="flex items-center justify-between gap-2 sm:block sm:text-right"><span className="tabular-nums">当前 {current === undefined ? "—" : compactNumber(current, 2)} · 基准 {baseline === undefined ? "—" : compactNumber(baseline, 2)}</span><span className={cn("ml-2 px-1.5 py-0.5 font-semibold", severityClass(domain.severity))}>{domain.gap_ratio >= 0 ? "+" : ""}{compactNumber(domain.gap_ratio * 100)}%</span></div></div>; })}</div></div> : null}
      {profile?.actions.length ? <div className="mt-5 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">建议</h3><div className="mt-1">{profile.actions.map((action, index) => <RecommendationCard key={`${action.domain_id}-${action.operator}-${index}`} action={action} variant="compact" index={index} />)}</div></div> : null}
      {profile?.flags.length || profile?.narration_hints.length ? <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border/70 pt-4">{[...(profile?.flags ?? []), ...(profile?.narration_hints ?? [])].map((flag) => <span key={flag} className="bg-muted px-2 py-1 text-xs text-muted-foreground">{flag}</span>)}</div> : null}
    </section>
  );
}
