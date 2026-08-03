"use client";

import { Download, FileJson, FlaskConical, Loader2, Settings2, Terminal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import {
  DebugActions,
  IssuePanel,
  Panel,
  PlanTelemetry,
  RunButton,
  ScheduleBoard,
  ShiftTabs,
  StatusBar,
} from "@/components";
import { ShiftComparisonCard } from "@/skland-components";
import type { RoomRow } from "@/schedule";
import type {
  BaseBlueprint,
  DisplayError,
  FeedbackData,
  IssueReport,
  MaaPlan,
  PublicPlanData,
  ShiftComparison,
} from "@/types";

interface InfraCalculatorProps {
  layout: BaseBlueprint;
  showBetaPanels: boolean;
  result: PublicPlanData | null;
  scheduleResult: PublicPlanData | null;
  activeShift: number;
  rows: RoomRow[];
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
  statusError: DisplayError | null;
  onLoadSample: () => Promise<boolean>;
  onOpenSetup: () => void;
  onRun: () => void;
  onRetry: () => void;
  onCopyDiagnostic: () => void;
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
    result, scheduleResult, activeShift, rows, currentMoraleByOperator,
    activePlan, closestComparison,
    resultClearNotice,
    issueForPanel, issueReport, feedbackResult, feedbackError,
    sampleLoading, loading, canRun, plannerReady, statusError,
    onLoadSample, onOpenSetup, onRun, onRetry, onCopyDiagnostic,
    onSetActiveShift, onMarkIssue,
    onFactoryRecipeChange, onTradeOrderChange,
    onDownloadMaa, onDownloadBundle, onCopyCommand,
    onClearResultNotice, onDismissResultClearWarning,
  } = props;
  const [scheduleViewMode, setScheduleViewMode] = useState<"list" | "compact">("list");
  const showBetaSidebar = showBetaPanels && scheduleViewMode === "list";

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
                className="grid w-full grid-cols-[minmax(12rem,1fr)_auto_auto_auto] items-center gap-2 max-sm:grid-cols-2"
                data-calculator-controls
              >
                <StatusBar
                  loading={loading}
                  result={result}
                  error={statusError}
                  ready={plannerReady}
                  onRetry={onRetry}
                  onCopyDiagnostic={onCopyDiagnostic}
                  className="max-sm:col-span-2"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="max-sm:col-span-2 max-sm:h-11 max-sm:justify-start"
                  aria-label="配置Box与布局"
                  onClick={onOpenSetup}
                >
                  <Settings2 />
                  配置Box与布局
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="max-sm:h-11 max-sm:text-xs"
                  disabled={sampleLoading}
                  aria-label="全角色导入"
                  onClick={() => void onLoadSample()}
                  data-full-e2
                >
                  {sampleLoading ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                  {sampleLoading ? "正在载入" : "全角色导入"}
                </Button>
                <RunButton canRun={canRun} loading={loading} onRun={onRun} />
              </div>
            )}
          >
            <PlanTelemetry
              profile={scheduleResult?.profile}
              rotation={scheduleResult?.rotation}
              layout={layout}
              activeShift={activeShift}
            />
            <ShiftComparisonCard comparison={closestComparison} />
            <ScheduleBoard
              rows={rows}
              layout={layout}
              currentMoraleByOperator={currentMoraleByOperator}
              activeShift={activeShift}
              activePlan={activePlan}
              shiftInfoSlot={(
                <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-between">
                  <ShiftTabs
                    maaJson={result?.maa}
                    rotation={result?.rotation}
                    active={activeShift}
                    closest={closestComparison?.planIndex}
                    onChange={onSetActiveShift}
                  />
                  <Button type="button" size="sm" variant="outline" disabled={!result?.maa} onClick={onDownloadMaa}>
                    <Download />导出到 MAA
                  </Button>
                </div>
              )}
              onIssue={onMarkIssue}
              onFactoryRecipeChange={onFactoryRecipeChange}
              onTradeOrderChange={onTradeOrderChange}
              onViewModeChange={setScheduleViewMode}
            />
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
        <aside className="fixed left-1/2 top-4 z-[70] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 border border-[#FFD800]/70 bg-[#313131] px-4 py-3 text-white shadow-[0_16px_44px_rgba(0,0,0,0.35)]" aria-live="polite">
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
    </>
  );
}
