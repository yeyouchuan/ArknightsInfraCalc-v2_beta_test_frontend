"use client";

import dynamic from "next/dynamic";
import { Download, FileJson, FlaskConical, HeartPulse, Keyboard, Loader2, Play, Search, Settings2, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import { cn } from "@/lib/utils";
import type { ShiftDirection } from "@/motion";
import type { RoomRow } from "@/schedule";
import type {
  BaseBlueprint,
  FeedbackData,
  IssueReport,
  MaaPlan,
  PublicPlanData,
  ShiftComparison,
} from "@/types";

const ScheduleBoard = dynamic(() => import("@/components").then((module) => module.ScheduleBoard), { ssr: false });
const ShiftTabs = dynamic(() => import("@/components").then((module) => module.ShiftTabs), { ssr: false });
const PlanResultSummary = dynamic(
  () => import("@/components/PlanResultSummary").then((module) => module.PlanResultSummary),
  { ssr: false },
);
const DebugActions = dynamic(() => import("@/components").then((module) => module.DebugActions), { ssr: false });
const IssuePanel = dynamic(() => import("@/components").then((module) => module.IssuePanel), { ssr: false });

function Panel({ children, className = "", action, title, icon }: {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 py-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        {title || icon ? <div className="flex min-w-0 items-start gap-2">{icon}<h2 className="text-sm font-semibold tracking-tight">{title}</h2></div> : null}
        {action ? <div className={cn("ms-auto min-w-0 max-sm:w-full", !title && !icon && "w-full")}>{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

function RunButton({ canRun, plannerReady, onRun }: { canRun: boolean; plannerReady: boolean; onRun: () => void }) {
  const unavailableLabel = plannerReady ? "请先导入干员数据" : "排班服务暂不可用";
  return (
    <Button
      size="sm"
      className="h-9 min-w-0 max-sm:h-11 max-sm:px-3 max-sm:text-xs"
      aria-label={canRun ? "生成排班" : unavailableLabel}
      title={!canRun ? unavailableLabel : undefined}
      onClick={onRun}
      disabled={!canRun}
    >
      <Play />
      <span>{canRun ? "生成排班" : "导入后生成"}</span>
    </Button>
  );
}

interface InfraCalculatorProps {
  layout: BaseBlueprint;
  showBetaPanels: boolean;
  result: PublicPlanData | null;
  scheduleResult: PublicPlanData | null;
  activeShift: number;
  rows: RoomRow[];
  changedRoomIds: ReadonlySet<string>;
  planHistory: Array<{ savedAt: string; result: PublicPlanData }>;
  currentMoraleByOperator: Map<string, number> | undefined;
  activePlan: MaaPlan | undefined;
  closestComparison: ShiftComparison | null;
  resultClearNotice: string | null;
  issueForPanel: { row: RoomRow; note: string } | null;
  issueReport: IssueReport | null;
  feedbackResult: FeedbackData | null;
  feedbackError: string | null;
  sampleLoading: boolean;
  loading: boolean;
  canRun: boolean;
  plannerReady: boolean;
  accountControl?: ReactNode;
  onLoadSample: () => Promise<boolean>;
  onOpenSetup: () => void;
  onRun: () => void;
  onCancelRun: () => void;
  onRestorePlan: (entry: { savedAt: string; result: PublicPlanData }) => void;
  onSetActiveShift: (shift: number) => void;
  onMarkIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
  onClearResultNotice: () => void;
  onDismissResultClearWarning: () => void;
}

export function InfraCalculator(props: InfraCalculatorProps) {
  const {
    layout, showBetaPanels,
    result, scheduleResult, activeShift, rows, changedRoomIds, planHistory, currentMoraleByOperator,
    activePlan, closestComparison,
    resultClearNotice,
    issueForPanel, issueReport, feedbackResult, feedbackError,
    sampleLoading, loading, canRun, plannerReady, accountControl,
    onLoadSample, onOpenSetup, onRun, onCancelRun, onRestorePlan,
    onSetActiveShift, onMarkIssue,
    onFactoryRecipeChange, onTradeOrderChange,
    onDownloadMaa, onDownloadBundle, onCopyCommand,
    onClearResultNotice, onDismissResultClearWarning,
  } = props;
  const [scheduleViewMode, setScheduleViewMode] = useState<"list" | "compact">("list");
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [operatorQuery, setOperatorQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shiftDirection, setShiftDirection] = useState<ShiftDirection>(0);
  const [fiammettaPortrait, setFiammettaPortrait] = useState<string | null>(null);
  const showBetaSidebar = showBetaPanels && scheduleViewMode === "list";
  const fiammettaTarget = activePlan?.Fiammetta?.enable
    ? (Array.isArray(activePlan.Fiammetta.target) ? activePlan.Fiammetta.target[0] : activePlan.Fiammetta.target)
    : undefined;
  useEffect(() => {
    let cancelled = false;
    if (!fiammettaTarget) {
      setFiammettaPortrait(null);
      return;
    }
    void import("@/operatorPortraits").then(({ operatorPortraitFor }) => {
      if (!cancelled) setFiammettaPortrait(operatorPortraitFor(fiammettaTarget) ?? null);
    });
    return () => { cancelled = true; };
  }, [fiammettaTarget]);
  const handleSetActiveShift = (nextShift: number) => {
    setShiftDirection(nextShift === activeShift ? 0 : nextShift > activeShift ? 1 : -1);
    onSetActiveShift(nextShift);
  };
  const renderExportActions = (placement: "desktop" | "mobile") => (
    <div
      className={placement === "desktop"
        ? "hidden items-center gap-2 md:flex"
        : "flex min-w-0 items-center justify-end gap-2"}
      data-calculator-export-actions={placement}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={sampleLoading}
        aria-label="全角色导入"
        onClick={() => void onLoadSample()}
        data-full-e2
      >
        {sampleLoading ? <Loader2 className="animate-spin" /> : <FlaskConical />}
        {sampleLoading ? "正在载入" : "全角色导入"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={!result?.maa} onClick={onDownloadMaa}>
        <Download />导出到 MAA
      </Button>
    </div>
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setOperatorQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      <section
        className={showBetaSidebar ? "infra-technical-canvas grid grid-cols-[minmax(0,1fr)_clamp(320px,22vw,360px)] items-start max-[1100px]:block" : "infra-technical-canvas block"}
        data-infra-canvas
      >
        <section className={showBetaSidebar ? "min-w-0 pr-5 max-[1100px]:pr-0" : "min-w-0"}>
          <Panel
            className="min-h-[calc(100vh-112px)]"
            action={(
              <div
                className="grid w-full grid-cols-[minmax(14rem,1fr)_auto_auto] items-center gap-2 max-sm:grid-cols-2"
                data-calculator-controls
              >
                <div className="flex min-w-0 items-center gap-2 max-sm:col-span-2">
                  <label className="relative block min-w-0 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      ref={searchInputRef}
                      value={operatorQuery}
                      onChange={(event) => setOperatorQuery(event.target.value)}
                      placeholder="搜索排班中的干员或房间"
                      aria-label="搜索排班中的干员或房间"
                      className="h-9 pr-10 pl-9 max-sm:h-11"
                    />
                    {operatorQuery ? (
                      <button
                        type="button"
                        onClick={() => { setOperatorQuery(""); searchInputRef.current?.focus(); }}
                        className="absolute top-1/2 right-0 grid size-9 -translate-y-1/2 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] max-sm:size-11"
                        aria-label="清空排班搜索"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </label>
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="outline"
                    className="size-9 max-sm:size-11"
                    aria-label="查看快捷键"
                    title="查看快捷键"
                    onClick={() => setShortcutGuideOpen(true)}
                  >
                    <Keyboard />
                  </Button>
                </div>
                <div className="inline-flex min-w-0" data-calculator-setup-group>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={accountControl
                      ? "h-9 min-w-0 rounded-r-none max-sm:h-11 max-sm:flex-1 max-sm:justify-start"
                      : "h-9 min-w-0 max-sm:h-11 max-sm:flex-1 max-sm:justify-start"}
                    aria-label="配置Box与布局"
                    onClick={onOpenSetup}
                  >
                    <Settings2 />
                    配置Box与布局
                  </Button>
                  {accountControl}
                </div>
                {loading ? (
                  <Button type="button" variant="destructive" className="h-9 max-sm:h-11" onClick={onCancelRun} aria-label="取消计算">
                    <Loader2 className="animate-spin" />
                    取消计算
                  </Button>
                ) : <RunButton canRun={canRun} plannerReady={plannerReady} onRun={onRun} />}
              </div>
            )}
          >
            {scheduleResult ? (
              <PlanResultSummary
                profile={scheduleResult.profile}
                rotation={scheduleResult.rotation}
                layout={layout}
                activeShift={activeShift}
                comparison={closestComparison}
                planRevision={scheduleResult.diagnosticId}
              />
            ) : null}
            {rows.length > 0 ? <ScheduleBoard
              rows={rows}
              changedRoomIds={changedRoomIds}
              layout={layout}
              planRevision={result?.diagnosticId}
              currentMoraleByOperator={currentMoraleByOperator}
              activeShift={activeShift}
              shiftDirection={shiftDirection}
              activePlan={activePlan}
              searchQuery={operatorQuery}
              viewControlsSlot={(
                <ShiftTabs
                  maaJson={result?.maa}
                  rotation={result?.rotation}
                  active={activeShift}
                  closest={closestComparison?.planIndex}
                  onChange={handleSetActiveShift}
                />
              )}
              mobileActionsSlot={renderExportActions("mobile")}
              shiftInfoSlot={(
                <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-between">
                  {fiammettaTarget ? (
                    <span className="flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-[#016E65]/30 bg-[#016E65]/10 px-2.5 text-[0.8rem] text-[#016E65] shadow-xs max-sm:h-11" title={`菲亚梅塔恢复 ${fiammettaTarget}`}>
                      <span className="size-5 shrink-0 overflow-hidden rounded-full border border-[#016E65]/25 bg-[#272A2B]">
                        {fiammettaPortrait ? <img src={fiammettaPortrait} alt="" className="size-full object-cover" /> : <HeartPulse className="m-1 size-3 text-[#016E65]" />}
                      </span>
                      <span className="whitespace-nowrap"><span className="text-[#016E65]/70">换心情</span> {fiammettaTarget}</span>
                    </span>
                  ) : null}
                  {planHistory.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-2" aria-label="最近求解记录">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">最近记录</span>
                      <Tabs
                        value={result?.diagnosticId ?? ""}
                        onValueChange={(diagnosticId) => {
                          const entry = planHistory.find((item) => item.result.diagnosticId === diagnosticId);
                          if (entry) onRestorePlan(entry);
                        }}
                      >
                        <TabsList>
                          {planHistory.map((entry, index) => (
                            <TabsTrigger key={entry.result.diagnosticId} value={entry.result.diagnosticId}>
                              {index + 1}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>
                  ) : null}
                  {renderExportActions("desktop")}
                </div>
              )}
              onIssue={onMarkIssue}
              onFactoryRecipeChange={onFactoryRecipeChange}
              onTradeOrderChange={onTradeOrderChange}
              onViewModeChange={setScheduleViewMode}
            /> : (
              <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
                没有可展示的布局房间。
              </div>
            )}
          </Panel>
          {feedbackResult ? (
            <div className="mt-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
              反馈已提交，编号：{feedbackResult.feedbackId}
            </div>
          ) : null}
        </section>

        {showBetaSidebar ? (
          <aside className="min-w-0 divide-y divide-border/70 border-l border-border/70 pl-5 max-[1100px]:mt-5 max-[1100px]:grid max-[1100px]:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] max-[1100px]:divide-x max-[1100px]:divide-y-0 max-[1100px]:border-l-0 max-[1100px]:border-t max-[1100px]:pl-0 max-[1100px]:[&>section]:px-5 max-[700px]:block max-[700px]:divide-x-0 max-[700px]:divide-y max-[700px]:[&>section]:px-0">
            <Panel title="问题上下文" icon={<FileJson className="size-4" />}>
              <IssuePanel issue={issueForPanel} report={issueReport} feedback={feedbackResult} feedbackError={feedbackError} />
            </Panel>
            <Panel title="调试输出" icon={<Terminal className="size-4" />}>
              <DebugActions result={result} onDownloadMaa={onDownloadMaa} onDownloadBundle={onDownloadBundle} onCopyCommand={onCopyCommand} />
              <details className="mt-3 text-sm text-muted-foreground">
                <summary className="cursor-pointer">stdout / stderr</summary>
                <Textarea readOnly value={result?.debug?.stdout || result?.debug?.stderr || "暂无输出。"} className="mt-2 max-h-64 min-h-32 resize-y font-mono text-xs" />
              </details>
            </Panel>
          </aside>
        ) : null}
      </section>

      {resultClearNotice ? (
        <aside className="fixed left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+5rem))] z-[70] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 border border-[#FFD800]/70 bg-[#313131] px-4 py-3 text-white shadow-[0_16px_44px_rgba(0,0,0,0.35)]" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block text-sm font-semibold text-[#FFD800]">已清空旧求解结果</strong>
              <span className="mt-0.5 block text-xs text-white/68">{resultClearNotice}，需要重新运行求解。</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={onClearResultNotice}>知道了</Button>
              <Button type="button" size="sm" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={onDismissResultClearWarning}>不再提示</Button>
            </div>
          </div>
        </aside>
      ) : null}
      <Dialog open={shortcutGuideOpen} onOpenChange={setShortcutGuideOpen}>
        <DialogContent className="gap-8 sm:max-w-2xl sm:p-8">
          <DialogHeader className="gap-2 px-1 sm:px-2">
            <DialogTitle className="text-xl font-semibold">快捷键</DialogTitle>
            <DialogDescription className="max-w-lg text-sm leading-6">在排班主界面快速定位搜索、关闭临时状态或切换导航。</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border/70 border-y border-border/70 px-1 sm:px-2">
            <div className="flex min-h-20 items-center justify-between gap-8 py-5 max-sm:flex-wrap max-sm:gap-3">
              <span className="text-[15px] font-medium leading-6">聚焦排班搜索</span>
              <KbdGroup className="shrink-0" aria-label="Control 加 K"><Kbd>Ctrl</Kbd><span aria-hidden="true">+</span><Kbd>K</Kbd></KbdGroup>
            </div>
            <div className="flex min-h-20 items-center justify-between gap-8 py-5 max-sm:flex-wrap max-sm:gap-3">
              <span className="text-[15px] font-medium leading-6">清空搜索；计算中取消请求</span>
              <Kbd className="shrink-0">Esc</Kbd>
            </div>
            <div className="flex min-h-20 items-center justify-between gap-8 py-5 max-sm:flex-wrap max-sm:gap-3">
              <span className="text-[15px] font-medium leading-6">展开或收起侧边栏</span>
              <KbdGroup className="shrink-0" aria-label="Control 加 B"><Kbd>Ctrl</Kbd><span aria-hidden="true">+</span><Kbd>B</Kbd></KbdGroup>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
