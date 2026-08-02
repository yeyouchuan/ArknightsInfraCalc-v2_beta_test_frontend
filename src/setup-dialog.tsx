"use client";

import { useEffect, useState } from "react";
import { Check, Database, FileJson, LayoutGrid, ScanLine, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { RotationSettings } from "@/components/RotationSettings";

import type { FactoryRecipe, PowerBudget, TradeOrder } from "./blueprint";
import { roomSummary } from "./blueprint";
import { AccountStats, FileDrop, LayoutEditor, PresetSelector } from "./components";
import { countOwned } from "./operbox";
import type { SetupStep } from "./onboarding";
import type { BaseBlueprint, BoxSource, DisplayError, OperBoxEntry, PresetDef, RotationProfile, SklandSnapshot } from "./types";

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
  onOpenSkland: () => void;
  onMaaFile: (file: File) => Promise<boolean>;
  onMaaPaste: () => boolean;
  presets: PresetDef[];
  preset: PresetDef;
  layout: BaseBlueprint;
  rotationProfile: RotationProfile;
  onRotationProfileChange: (value: RotationProfile) => void;
  onPresetSelect: (preset: PresetDef) => void;
  onLayoutFile: (file: File) => Promise<void>;
  onDownloadLayout: () => void;
  onRestoreResultClearWarning: () => void;
  storageNotice: DisplayError | null;
  onClearLocalData: () => void;
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
  return "243 全精二示例";
}

function formatSyncTime(timestamp: number | null | undefined): string {
  const date = timestamp && Number.isFinite(timestamp) ? new Date(timestamp * 1000) : null;
  if (!date || Number.isNaN(date.getTime())) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(date);
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
  onOpenSkland,
  onMaaFile,
  onMaaPaste,
  presets,
  preset,
  layout,
  rotationProfile,
  onRotationProfileChange,
  onPresetSelect,
  onLayoutFile,
  onDownloadLayout,
  onRestoreResultClearWarning,
  storageNotice,
  onClearLocalData,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onRoomLevelChange,
  powerBudget,
  onFinish,
  onSkip,
}: SetupDialogProps) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const hasBox = Boolean(operbox?.length);

  useEffect(() => {
    if (open) setStep(initialStep);
  }, [initialStep, open]);

  async function importMaaFile(file: File) {
    if (await onMaaFile(file)) setStep("layout");
  }

  function importMaaPaste() {
    if (onMaaPaste()) setStep("layout");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(820px,calc(100dvh-1rem))] max-w-[calc(100vw-1rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[min(1040px,calc(100vw-2rem))]">
        <DialogHeader className="px-5 py-5 pr-16 sm:px-7">
          <DialogTitle className="flex items-center gap-3 text-lg">
            <span className="h-6 w-1 shrink-0 bg-primary" aria-hidden="true" />
            配置干员数据（Box）、换班与布局
          </DialogTitle>
          <DialogDescription className="text-pretty">导入干员数据，再确认换班方式与基建设施。修改会立即应用，但不会自动生成排班。</DialogDescription>
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
                <strong className="block text-sm">导入干员数据</strong>
                <span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">森空岛、MAA 或测试样例</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="layout" disabled={!hasBox} className="h-12 justify-start gap-3 rounded-lg px-3 text-left">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background text-xs font-semibold shadow-xs">2</span>
              <span className="min-w-0">
                <strong className="block text-sm">配置基建与换班</strong>
                <span className="hidden truncate text-xs font-normal text-muted-foreground sm:block">布局、换班、等级、产品和订单</span>
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="box" className="min-h-0 overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
            <ScrollArea className="h-full">
              <div className="mx-auto grid max-w-3xl gap-5 px-5 sm:px-7">
                <section className="surface-shadow rounded-xl bg-card p-4 sm:p-5">
                  <Tabs value={inputMode} onValueChange={(value) => onInputModeChange(value as "skland" | "maa")}>
                    <TabsList className="h-auto w-full rounded-lg sm:w-auto">
                      <TabsTrigger value="skland"><Database />森空岛同步</TabsTrigger>
                      <TabsTrigger value="maa"><FileJson />MAA 导入</TabsTrigger>
                    </TabsList>
                    <TabsContent value="skland" className="pt-4">
                      {sklandSnapshot ? (
                        <InfraTechnicalCard group="trading" showEmblem={false} className="rounded-xl p-4 sm:p-5">
                          <InfraTechnicalHeading icon={<Database className="size-4" />}>森空岛已同步</InfraTechnicalHeading>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 text-sm font-semibold ring-1 ring-white/10">
                                {sklandSnapshot.player.avatarUrl ? (
                                  <img
                                    src={sklandSnapshot.player.avatarUrl}
                                    alt=""
                                    width={44}
                                    height={44}
                                    referrerPolicy="no-referrer"
                                    className="size-full object-cover"
                                  />
                                ) : sklandSnapshot.player.nickname.slice(0, 1)}
                              </span>
                              <div className="min-w-0">
                                <strong className="block truncate text-white">{sklandSnapshot.player.nickname}</strong>
                                <span className="mt-1 block text-xs text-white/60">
                                  {sklandSnapshot.player.channelName} · {sklandSnapshot.operbox.length} 名干员 · {formatSyncTime(sklandSnapshot.infrastructure.storeTs)}
                                </span>
                              </div>
                            </div>
                            <Button className="h-11 w-full border-white/18 bg-white/8 text-white hover:bg-white/14 hover:text-white sm:w-auto" type="button" variant="outline" onClick={onOpenSkland}>
                              <Database />前往森空岛状态
                            </Button>
                          </div>
                          {sklandSnapshot.warnings.length ? (
                            <ul className="mt-4 grid gap-1 border-t border-white/10 pt-3 text-xs text-amber-200">
                              {sklandSnapshot.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                            </ul>
                          ) : null}
                        </InfraTechnicalCard>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center">
                          <ScanLine className="mx-auto size-7 text-primary" />
                          <strong className="mt-3 block">登录森空岛并同步干员数据</strong>
                          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                            {sklandConfigured
                              ? "登录、角色切换与退出已集中到侧边栏的森空岛状态中心。"
                              : sklandDisabledReason ?? "当前未开放森空岛登录，可使用 MAA 导入。"}
                          </p>
                          <Button type="button" className="mt-4 h-10" onClick={onOpenSkland}>
                            <ScanLine />前往森空岛状态
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
                        className="min-h-28 resize-y rounded-lg font-mono text-base sm:text-sm"
                        aria-invalid={Boolean(inputError)}
                        aria-describedby={inputError ? "setup-box-error" : undefined}
                      />
                      <Button type="button" variant="outline" className="h-10 w-full" disabled={!maaPaste.trim()} onClick={importMaaPaste}>
                        导入粘贴内容
                      </Button>
                    </TabsContent>
                  </Tabs>
                </section>

                {hasBox ? (
                  <InfraTechnicalCard group="control" showEmblem={false} className="grid gap-3 rounded-xl p-4 sm:p-5">
                    <InfraTechnicalHeading icon={<Database className="size-4" />}>当前干员数据</InfraTechnicalHeading>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs text-white/58">数据来源</span>
                        <strong className="mt-0.5 block truncate text-white">{sourceLabel(boxSource)}</strong>
                        {fileName ? <span className="block truncate text-xs text-white/58">{fileName}</span> : null}
                      </div>
                      <span className="text-sm font-medium tabular-nums text-white">{operbox?.length ?? 0} 条记录</span>
                    </div>
                    <AccountStats operbox={operbox} />
                    {operbox && countOwned(operbox) === 0 ? (
                      <Alert className="rounded-lg border-amber-300/30 bg-amber-300/10 text-amber-100">
                        <AlertDescription className="text-amber-100">练度表已读入，但没有识别到 own=true，仍可继续配置。</AlertDescription>
                      </Alert>
                    ) : null}
                  </InfraTechnicalCard>
                ) : null}
                {inputError ? <p id="setup-box-error" className="text-sm text-destructive" role="alert">{inputError}</p> : null}
                {storageNotice ? (
                  <Alert className="rounded-lg border-amber-200 bg-amber-50 text-amber-700" role="status">
                    <AlertDescription className="text-amber-700">
                      {storageNotice.message}（{storageNotice.code}）
                    </AlertDescription>
                  </Alert>
                ) : null}
                <section className="surface-shadow rounded-xl bg-card p-4 sm:p-5">
                  <h3 className="text-sm font-semibold">本地数据</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    布局、干员数据和最近排班会在此浏览器保存 30 天。清除后会重置当前页面，但不会自动退出森空岛账号。
                  </p>
                  <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => setClearConfirmOpen(true)}>
                    <Trash2 />清除本地数据
                  </Button>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layout" className="min-h-0 overflow-hidden  px-5 py-5 sm:px-7 sm:py-6">
            <ScrollArea className="h-full">
              <div className="grid gap-5 px-5 sm:px-7 lg:grid-cols-[280px_minmax(0,1fr)]">
                <section className="surface-shadow min-w-0 self-start rounded-xl bg-card p-4 lg:sticky lg:top-0">
                  <div className="mb-4 flex items-start gap-2">
                    <LayoutGrid className="mt-0.5 size-4 text-primary" />
                    <div>
                      <h3 className="text-sm font-semibold">布局预设</h3>
                      <p className="text-xs text-muted-foreground">选择后立即替换布局并清除旧结果。</p>
                    </div>
                  </div>
                  <PresetSelector presets={presets} selected={preset} onSelect={onPresetSelect} />
                  <details className="mt-4 border-t border-border/70 pt-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">高级设置</summary>
                    <RotationSettings value={rotationProfile} onChange={onRotationProfileChange} />
                    <p className="mb-2 mt-4 border-t border-border/70 pt-4 text-xs text-muted-foreground">导入或导出布局文件，适合跨设备复用配置。</p>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-[color,border-color,background-color,scale] duration-150 ease-out active:scale-[0.96] hover:border-primary hover:bg-muted/40 hover:text-primary motion-reduce:transform-none">
                      <Upload className="size-4" />导入布局文件
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
                    <Button type="button" variant="outline" className="mt-2 min-h-11 w-full" onClick={onDownloadLayout}>
                      <FileJson />导出布局文件
                    </Button>
                  </details>
                  <InfraTechnicalCard group="manufacture" showEmblem={false} className="mt-4 rounded-lg px-3 py-3 shadow-none">
                    <span className="block text-xs text-white/58">当前布局</span>
                    <strong className="mt-1 block text-sm text-white">{preset.label}</strong>
                    <span className="mt-1 block text-xs text-white/62">{roomSummary(layout)}</span>
                  </InfraTechnicalCard>
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
                  {inputError ? <p id="setup-layout-error" className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-background px-5 py-3 sm:px-7">
          <Button className="h-10" type="button" variant="ghost" disabled={!resultClearWarningDismissed} onClick={onRestoreResultClearWarning}>
            恢复切换提示
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {step === "box" ? (
              <>
                <Button className="h-10" type="button" variant="ghost" onClick={onSkip}>稍后设置</Button>
                <Button className="h-10" type="button" disabled={!hasBox} onClick={() => setStep("layout")}>下一步：配置基建与换班</Button>
              </>
            ) : (
              <>
                <Button className="h-10" type="button" variant="ghost" onClick={() => setStep("box")}>上一步：修改干员数据</Button>
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
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="max-w-[min(460px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>清除本地数据？</DialogTitle>
            <DialogDescription>
              将删除此浏览器中的布局、干员数据、最近排班和提示偏好。森空岛登录状态不会自动退出。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setClearConfirmOpen(false)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                onClearLocalData();
                setClearConfirmOpen(false);
              }}
            >
              清除本地数据
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
