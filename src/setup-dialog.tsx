"use client";

import { useEffect, useState } from "react";
import { Check, Database, FileJson, FlaskConical, LayoutGrid, RefreshCw, ScanLine, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { FactoryRecipe, PowerBudget, TradeOrder } from "./blueprint";
import { roomSummary } from "./blueprint";
import { AccountStats, FileDrop, LayoutEditor, PresetSelector } from "./components";
import { countOwned } from "./operbox";
import type { SetupStep } from "./onboarding";
import type { BaseBlueprint, BoxSource, OperBoxEntry, PresetDef, SklandSnapshot } from "./types";

type SetupDialogProps = {
  open: boolean;
  initialStep: SetupStep;
  onOpenChange: (open: boolean) => void;
  operbox: OperBoxEntry[] | null;
  boxSource: BoxSource;
  fileName: string | null;
  inputMode: "skland" | "maa";
  onInputModeChange: (mode: "skland" | "maa") => void;
  maaPaste: string;
  onMaaPasteChange: (value: string) => void;
  inputError: string | null;
  resultClearWarningDismissed: boolean;
  sklandSnapshot: SklandSnapshot | null;
  sklandConfigured: boolean;
  sklandDisabledReason: string | null;
  sklandBusy: boolean;
  onOpenSkland: () => void;
  onRefreshSkland: () => Promise<void>;
  onUseSkland: () => void;
  onMaaFile: (file: File) => Promise<boolean>;
  onMaaPaste: () => boolean;
  onLoadSample: () => Promise<boolean>;
  presets: PresetDef[];
  preset: PresetDef;
  layout: BaseBlueprint;
  onPresetSelect: (preset: PresetDef) => void;
  onLayoutFile: (file: File) => Promise<void>;
  onDownloadLayout: () => void;
  onRestoreResultClearWarning: () => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onRoomLevelChange: (roomId: string, level: number) => void;
  powerBudget: PowerBudget;
  onFinish: () => void;
  onSkip: () => void;
};

function sourceLabel(source: BoxSource): string {
  if (source === "skland") return "森空岛";
  if (source === "maa") return "MAA 导入";
  return "243 全精二样例";
}

function formatSyncTime(timestamp: number | undefined): string {
  if (!timestamp) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp * 1000));
}

export function SetupDialog({
  open,
  initialStep,
  onOpenChange,
  operbox,
  boxSource,
  fileName,
  inputMode,
  onInputModeChange,
  maaPaste,
  onMaaPasteChange,
  inputError,
  resultClearWarningDismissed,
  sklandSnapshot,
  sklandConfigured,
  sklandDisabledReason,
  sklandBusy,
  onOpenSkland,
  onRefreshSkland,
  onUseSkland,
  onMaaFile,
  onMaaPaste,
  onLoadSample,
  presets,
  preset,
  layout,
  onPresetSelect,
  onLayoutFile,
  onDownloadLayout,
  onRestoreResultClearWarning,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onRoomLevelChange,
  powerBudget,
  onFinish,
  onSkip,
}: SetupDialogProps) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const hasBox = Boolean(operbox?.length);

  useEffect(() => {
    if (open) setStep(initialStep);
  }, [initialStep, open]);

  async function importMaaFile(file: File) {
    if (await onMaaFile(file)) setStep("layout");
  }

  async function loadSample() {
    if (await onLoadSample()) setStep("layout");
  }

  function importMaaPaste() {
    if (onMaaPaste()) setStep("layout");
  }

  function useSklandBox() {
    onUseSkland();
    setStep("layout");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(820px,calc(100dvh-1rem))] max-w-[calc(100vw-1rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[min(1040px,calc(100vw-2rem))]">
        <DialogHeader className="px-5 py-5 pr-16 sm:px-7">
          <DialogTitle className="text-lg">配置 Box 与布局</DialogTitle>
          <DialogDescription className="text-pretty">导入干员 Box，再确认基建设施。修改会立即应用，但不会自动生成排班。</DialogDescription>
        </DialogHeader>

        <Tabs
          value={step}
          onValueChange={(value) => {
            if (value === "box" || (value === "layout" && hasBox)) setStep(value);
          }}
          className="contents"
        >
          <TabsList className="mx-4 grid h-auto w-auto grid-cols-2 rounded-xl bg-muted/70 p-1 sm:mx-7">
            <TabsTrigger value="box" className="h-12 justify-start gap-3 rounded-lg px-3 text-left">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-xs font-semibold shadow-xs">1</span>
              <span className="min-w-0">
                <strong className="block text-sm">导入 Box</strong>
                <span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">森空岛、MAA 或测试样例</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="layout" disabled={!hasBox} className="h-12 justify-start gap-3 rounded-lg px-3 text-left">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-xs font-semibold shadow-xs">2</span>
              <span className="min-w-0">
                <strong className="block text-sm">配置基建</strong>
                <span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">布局、等级、产品和订单</span>
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="box" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto grid max-w-3xl gap-5 px-5 py-5 sm:px-7 sm:py-6">
                <section className="surface-shadow rounded-xl bg-card p-4 sm:p-5">
                  <Tabs value={inputMode} onValueChange={(value) => onInputModeChange(value as "skland" | "maa")}>
                    <TabsList className="h-10 w-full rounded-lg sm:w-auto">
                      <TabsTrigger value="skland"><Database />森空岛同步</TabsTrigger>
                      <TabsTrigger value="maa"><FileJson />MAA 导入</TabsTrigger>
                    </TabsList>
                    <TabsContent value="skland" className="pt-4">
                      {sklandSnapshot ? (
                        <div className="grid gap-4">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="min-w-0">
                              <strong className="block truncate">{sklandSnapshot.player.nickname}</strong>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {sklandSnapshot.player.channelName} · {sklandSnapshot.operbox.length} 名干员 · {formatSyncTime(sklandSnapshot.infrastructure.storeTs)}
                              </span>
                            </div>
                            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                              <Button className="h-10" type="button" variant="outline" disabled={sklandBusy} onClick={() => void onRefreshSkland()}>
                                <RefreshCw className={sklandBusy ? "animate-spin" : ""} />刷新
                              </Button>
                              <Button className="h-10" type="button" onClick={useSklandBox}><Check />使用当前 Box</Button>
                            </div>
                          </div>
                          {sklandSnapshot.warnings.length ? (
                            <ul className="grid gap-1 border-t border-border/70 pt-3 text-xs text-amber-700">
                              {sklandSnapshot.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center">
                          <ScanLine className="mx-auto size-7 text-primary" />
                          <strong className="mt-3 block">登录森空岛并同步 Box</strong>
                          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                            {sklandConfigured ? "扫码登录后会自动带回角色 Box 和基建快照。" : sklandDisabledReason ?? "森空岛登录当前不可用。"}
                          </p>
                          <Button type="button" className="mt-4 h-10" disabled={!sklandConfigured} onClick={onOpenSkland}>
                            <ScanLine />登录森空岛
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="maa" className="space-y-3 pt-4">
                      <FileDrop fileName={boxSource === "maa" ? fileName : null} onFile={(file) => void importMaaFile(file)} />
                      <Textarea
                        value={maaPaste}
                        onChange={(event) => onMaaPasteChange(event.target.value)}
                        placeholder="粘贴 Arknights_OperBox_Export.json 内容"
                        className="min-h-28 resize-y rounded-lg font-mono text-xs"
                      />
                      <Button type="button" variant="outline" className="h-10 w-full" disabled={!maaPaste.trim()} onClick={importMaaPaste}>
                        导入粘贴内容
                      </Button>
                    </TabsContent>
                  </Tabs>
                </section>

                <section className="surface-shadow flex flex-col gap-3 rounded-xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <strong className="text-sm">没有可用的 Box？</strong>
                    <p className="mt-0.5 text-xs text-muted-foreground">载入内置样例可以先体验完整的排班流程。</p>
                  </div>
                  <Button type="button" variant="outline" className="h-10" onClick={() => void loadSample()}>
                    <FlaskConical />载入 243 全精二样例
                  </Button>
                </section>

                {hasBox ? (
                  <section className="surface-shadow grid gap-3 rounded-xl bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs text-muted-foreground">当前 Box 来源</span>
                        <strong className="mt-0.5 block truncate">{sourceLabel(boxSource)}</strong>
                        {fileName ? <span className="block truncate text-xs text-muted-foreground">{fileName}</span> : null}
                      </div>
                      <span className="text-sm font-medium tabular-nums">{operbox?.length ?? 0} 条记录</span>
                    </div>
                    <AccountStats operbox={operbox} />
                    {operbox && countOwned(operbox) === 0 ? (
                      <Alert className="rounded-lg border-amber-200 bg-amber-50 text-amber-700">
                        <AlertDescription className="text-amber-700">练度表已读入，但没有识别到 own=true，仍可继续配置。</AlertDescription>
                      </Alert>
                    ) : null}
                  </section>
                ) : null}
                {inputError ? <p className="text-sm text-destructive" role="alert">{inputError}</p> : null}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layout" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="grid gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <section className="surface-shadow min-w-0 self-start rounded-xl bg-card p-4 lg:sticky lg:top-0">
                  <div className="mb-4 flex items-start gap-2">
                    <LayoutGrid className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">布局预设</h3>
                      <p className="text-xs text-muted-foreground">选择后立即替换布局并清除旧结果。</p>
                    </div>
                  </div>
                  <PresetSelector presets={presets} selected={preset} onSelect={onPresetSelect} />
                  <label className="mt-4 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-[color,border-color,background-color,scale] duration-150 ease-out active:scale-[0.96] hover:border-primary hover:bg-muted/40 hover:text-primary motion-reduce:transform-none">
                    <Upload className="size-4" />导入 layout JSON
                    <input
                      className="sr-only"
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onLayoutFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <Button type="button" variant="outline" className="mt-2 h-10 w-full" onClick={onDownloadLayout}>
                    <FileJson />导出当前 layout JSON
                  </Button>
                  <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                    <span className="block font-medium text-foreground">当前 {preset.label}</span>
                    <span className="mt-1 block">{roomSummary(layout)}</span>
                  </div>
                </section>
                <section className="surface-shadow min-w-0 rounded-xl bg-muted/25 p-4 sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">设施等级、产品与订单</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">所有调整即时写入排班输入。</p>
                  </div>
                  <LayoutEditor
                    layout={layout}
                    onFactoryRecipeChange={onFactoryRecipeChange}
                    onTradeOrderChange={onTradeOrderChange}
                    onRoomLevelChange={onRoomLevelChange}
                  />
                  {inputError ? <p className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-7">
          <Button className="h-10" type="button" variant="ghost" disabled={!resultClearWarningDismissed} onClick={onRestoreResultClearWarning}>
            恢复切换提示
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {step === "box" ? (
              <>
                <Button className="h-10" type="button" variant="ghost" onClick={onSkip}>稍后设置</Button>
                <Button className="h-10" type="button" disabled={!hasBox} onClick={() => setStep("layout")}>下一步：配置基建</Button>
              </>
            ) : (
              <>
                <Button className="h-10" type="button" variant="ghost" onClick={() => setStep("box")}>上一步：修改 Box</Button>
                <span className="flex items-center gap-3">
                  <span className={`text-sm font-normal ${powerBudget.ok ? "text-muted-foreground" : "text-red-600"}`}>
                    发电 {powerBudget.generated} / 耗电 {powerBudget.consumed}
                    {!powerBudget.ok && " — 电量不足"}
                  </span>
                  <Button className="h-10" type="button" disabled={!powerBudget.ok} onClick={onFinish}><Check />完成设置</Button>
                </span>
              </>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
