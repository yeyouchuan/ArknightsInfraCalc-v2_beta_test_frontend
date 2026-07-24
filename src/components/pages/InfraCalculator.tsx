"use client";

import { Database, FileJson, FlaskConical, Loader2, Settings2, ShieldCheck, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import {
  DebugActions,
  IssuePanel,
  Panel,
  PlanTelemetry,
  ScheduleBoard,
  ShiftTabs,
} from "@/components";
import { InfrastructureSnapshot, ShiftComparisonCard } from "@/skland-components";
import type { RoomRow } from "@/schedule";
import type {
  BaseBlueprint,
  FeedbackApiResponse,
  IssueReport,
  MaaPlan,
  OperBoxEntry,
  PlanApiResponse,
  ShiftComparison,
  SklandSnapshot,
} from "@/types";

interface InfraCalculatorProps {
  operbox: OperBoxEntry[] | null;
  layout: BaseBlueprint;
  sklandSnapshot: SklandSnapshot | null;
  sklandLayoutMatches: boolean | null;
  result: PlanApiResponse | null;
  scheduleResult: PlanApiResponse | null;
  activeShift: number;
  rows: RoomRow[];
  currentMoraleByOperator: Map<string, number> | undefined;
  activePlan: MaaPlan | undefined;
  closestComparison: ShiftComparison | null;
  resultClearNotice: string | null;
  issueForPanel: { row: RoomRow; note: string } | null;
  issueReport: IssueReport | null;
  feedbackResult: FeedbackApiResponse | null;
  feedbackError: string | null;
  sampleLoading: boolean;
  onLoadSample: () => Promise<boolean>;
  onOpenSetup: () => void;
  onSetActiveShift: (shift: number) => void;
  onMarkIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onApplySklandLayout: () => void;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
  onClearResultNotice: () => void;
  onDismissResultClearWarning: () => void;
}

export function InfraCalculator(props: InfraCalculatorProps) {
  const {
    operbox, layout, sklandSnapshot, sklandLayoutMatches,
    result, scheduleResult, activeShift, rows, currentMoraleByOperator,
    activePlan, closestComparison,
    resultClearNotice,
    issueForPanel, issueReport, feedbackResult, feedbackError,
    sampleLoading,
    onLoadSample, onOpenSetup, onSetActiveShift, onMarkIssue,
    onFactoryRecipeChange, onTradeOrderChange,
    onApplySklandLayout, onDownloadMaa, onDownloadBundle, onCopyCommand,
    onClearResultNotice, onDismissResultClearWarning,
  } = props;

  return (
    <>
      <section className="grid grid-cols-[minmax(0,1fr)_430px] items-start max-[1100px]:block">
        <section className="min-w-0 pr-5 max-[1100px]:pr-0">
          <Panel
            title="计划安排"
            icon={<ShieldCheck className="size-4" />}
            className="min-h-[calc(100vh-112px)]"
            action={(
              <Button type="button" size="sm" disabled={sampleLoading} aria-label="载入 243 全精二测试 Box" onClick={() => void onLoadSample()}>
                {sampleLoading ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                {sampleLoading ? "正在载入" : "Full E2 测试"}
              </Button>
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-3 max-sm:flex-col">
              <div className="min-w-0">
                <strong className="block truncate text-sm font-medium">
                  {result?.maaJson?.title ?? "等待生成排班"}
                </strong>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {activePlan?.description ?? "配置 Box 与基建布局后，即可生成三班排班。"}
                </span>
              </div>
              <ShiftTabs maaJson={result?.maaJson} active={activeShift} closest={closestComparison?.planIndex} onChange={onSetActiveShift} />
            </div>
            {!operbox ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-y border-dashed border-border/70 py-6">
                <div>
                  <strong className="block text-sm">先选择用于验收的 Box</strong>
                  <p className="mt-1 text-sm text-muted-foreground">使用上方 Full E2 测试入口，或配置自己的 Box 与基建布局。</p>
                </div>
                <Button type="button" variant="outline" onClick={onOpenSetup}>
                  <Settings2 />配置 Box 与布局
                </Button>
              </div>
            ) : null}
            <PlanTelemetry
              profile={scheduleResult?.profileJson}
              rotation={scheduleResult?.rotationJson}
              layout={layout}
              activeShift={activeShift}
            />
            <ShiftComparisonCard comparison={closestComparison} />
            <ScheduleBoard
              rows={rows}
              layout={layout}
              currentMoraleByOperator={currentMoraleByOperator}
              onIssue={onMarkIssue}
              onFactoryRecipeChange={onFactoryRecipeChange}
              onTradeOrderChange={onTradeOrderChange}
            />
          </Panel>
        </section>

        <aside className="min-w-0 divide-y divide-border/70 border-l border-border/70 pl-5 max-[1100px]:mt-5 max-[1100px]:grid max-[1100px]:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] max-[1100px]:divide-x max-[1100px]:divide-y-0 max-[1100px]:border-l-0 max-[1100px]:border-t max-[1100px]:pl-0 max-[1100px]:[&>section]:px-5 max-[700px]:block max-[700px]:divide-x-0 max-[700px]:divide-y max-[700px]:[&>section]:px-0">
          {sklandSnapshot ? (
            <Panel title="当前状态 · 森空岛基建" icon={<Database className="size-4" />}>
              <InfrastructureSnapshot snapshot={sklandSnapshot} layoutMatches={sklandLayoutMatches ?? false} onApplyLayout={onApplySklandLayout} />
            </Panel>
          ) : null}
          <Panel title="问题上下文" icon={<FileJson className="size-4" />}>
            <IssuePanel issue={issueForPanel} report={issueReport} feedback={feedbackResult} feedbackError={feedbackError} />
          </Panel>
          <Panel title="调试输出" icon={<Terminal className="size-4" />}>
            <DebugActions result={result} onDownloadMaa={onDownloadMaa} onDownloadBundle={onDownloadBundle} onCopyCommand={onCopyCommand} />
            <details className="mt-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer">stdout / stderr</summary>
              <Textarea readOnly value={result?.stdout || result?.stderr || "暂无输出。"} className="mt-2 max-h-64 min-h-32 resize-y font-mono text-xs" />
            </details>
          </Panel>
        </aside>
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
