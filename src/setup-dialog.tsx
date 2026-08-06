"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Database, FileJson, ScanLine, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { RotationSettings } from "@/components/RotationSettings";
import { CLIENT_SKLAND_ENABLED } from "@/client-features";

import type { FactoryRecipe, PowerBudget, TradeOrder } from "./blueprint";
import { FileDrop, LayoutEditor, PresetSelector } from "./components";
import { countOwned } from "./operbox";
import type { SetupStep } from "./onboarding";
import type { BaseBlueprint, BoxSource, DisplayError, OperBoxEntry, PresetDef, RotationProfile, SklandScheduleSnapshot } from "./types";

type LayoutSection = "basics" | "facilities";

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
  sklandSnapshot?: SklandScheduleSnapshot | null;
  sklandConfigured?: boolean;
  sklandDisabledReason?: string | null;
  onOpenSkland?: () => void;
  onUseSklandSnapshot?: () => void;
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
  if (CLIENT_SKLAND_ENABLED && source === "skland") return "森空岛";
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
  onUseSklandSnapshot,
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
  const [layoutSection, setLayoutSection] = useState<LayoutSection>("basics");
  const [needsFacilityReview, setNeedsFacilityReview] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [showMaaPaste, setShowMaaPaste] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const wasOpenRef = useRef(false);
  const pendingExternalReviewRef = useRef(false);
  const boxPanelRef = useRef<HTMLDivElement>(null);
  const basicsPanelRef = useRef<HTMLDivElement>(null);
  const facilitiesPanelRef = useRef<HTMLDivElement>(null);
  const hasBox = Boolean(operbox?.length);
  const ownedCount = countOwned(operbox);
  const mustReviewFacilities = needsFacilityReview || !powerBudget.ok;
  const currentDataLabel = fileName || sourceLabel(boxSource);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    setStep(initialStep);
    setLayoutSection("basics");
    setNeedsFacilityReview(pendingExternalReviewRef.current);
    pendingExternalReviewRef.current = false;
    setShowImportOptions(!hasBox);
    setShowMaaPaste(false);
  }, [hasBox, initialStep, open]);

  useEffect(() => {
    if (open && !hasBox) setShowImportOptions(true);
  }, [hasBox, open]);

  function focusPanel(ref: { current: HTMLDivElement | null }) {
    window.requestAnimationFrame(() => ref.current?.focus());
  }

  function goToBox() {
    setStep("box");
    focusPanel(boxPanelRef);
  }

  function goToBasics() {
    setStep("layout");
    setLayoutSection("basics");
    focusPanel(basicsPanelRef);
  }

  function reviewFacilities() {
    setLayoutSection("facilities");
    setNeedsFacilityReview(false);
    focusPanel(facilitiesPanelRef);
  }

  async function importMaaFile(file: File) {
    if (await onMaaFile(file)) {
      setNeedsFacilityReview(true);
      setShowImportOptions(false);
      goToBasics();
    }
  }

  function importMaaPaste() {
    if (onMaaPaste()) {
      setNeedsFacilityReview(true);
      setShowImportOptions(false);
      goToBasics();
    }
  }

  function handlePresetSelect(nextPreset: PresetDef) {
    if (nextPreset.label !== preset.label) setNeedsFacilityReview(true);
    onPresetSelect(nextPreset);
  }

  async function handleLayoutFile(file: File) {
    setNeedsFacilityReview(true);
    await onLayoutFile(file);
  }

  function handleOpenSkland() {
    pendingExternalReviewRef.current = true;
    onOpenSkland?.();
  }

  function handleUseSklandSnapshot() {
    if (!sklandSnapshot) return;
    onUseSklandSnapshot?.();
    setNeedsFacilityReview(true);
    setShowImportOptions(false);
    goToBasics();
  }

  function handleLayoutSectionChange(value: string) {
    if (value !== "basics" && value !== "facilities") return;
    setLayoutSection(value);
    if (value === "facilities") setNeedsFacilityReview(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-setup-dialog className="max-h-[min(820px,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[min(880px,calc(100%-2rem))] sm:rounded-[32px]">
        <Tabs
          value={step}
          onValueChange={(value) => {
            if (value === "box") setStep("box");
            if (value === "layout" && hasBox) {
              setStep("layout");
              setLayoutSection("basics");
            }
          }}
          className="contents"
        >
          <div data-setup-top className="px-4 pb-3 pt-4 sm:px-7 sm:pb-4 sm:pt-6">
            <DialogTitle className="min-h-9 pr-12">排班设置</DialogTitle>
            <TabsList
              data-setup-step-list
              variant="line"
              aria-label="设置步骤"
              className="setup-step-list mt-1 flex w-fit max-w-full items-center justify-start gap-0 p-0"
            >
              <TabsTrigger
                value="box"
                className={`setup-step-trigger h-9 min-h-0 flex-none justify-start rounded-none border-0 px-0.5 py-0 text-base font-semibold after:hidden sm:px-0.5 ${step === "layout" && hasBox ? "text-emerald-700 hover:text-emerald-700" : ""}`}
              >
                干员数据
              </TabsTrigger>
              <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/55" aria-hidden="true" />
              <TabsTrigger
                value="layout"
                disabled={!hasBox}
                className="setup-step-trigger h-9 min-h-0 flex-none justify-start rounded-none border-0 px-0.5 py-0 text-base font-semibold after:hidden sm:px-0.5"
              >
                基建与换班
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="box" className="min-h-0 overflow-hidden overscroll-contain">
            <ScrollArea className="h-full">
              <div
                ref={boxPanelRef}
                data-setup-box-content
                role="region"
                aria-label="干员数据"
                tabIndex={-1}
                className="grid w-full gap-4 px-4 py-4 outline-none sm:px-7 sm:py-6"
              >
                {hasBox ? (
                  <section className="setup-data-summary flex min-w-0 items-center justify-between gap-4 px-4 py-3.5" aria-labelledby="setup-current-data-title">
                    <div className="flex min-w-0 items-center gap-3">
                      <Database className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 id="setup-current-data-title" className="truncate text-sm font-semibold">{currentDataLabel}</h3>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <span className="font-number">{operbox?.length ?? 0}</span> 名干员 · <span className="font-number">{ownedCount}</span> 名可用
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 shrink-0"
                      aria-expanded={showImportOptions}
                      aria-controls="setup-import-options"
                      onClick={() => setShowImportOptions((current) => !current)}
                    >
                      {showImportOptions ? "收起" : "更换"}
                    </Button>
                  </section>
                ) : null}

                {showImportOptions ? (
                  <section id="setup-import-options" className="setup-config-panel p-4 sm:p-5" aria-labelledby="setup-import-title">
                    <h3 id="setup-import-title" className="sr-only">选择干员数据来源</h3>
                    <Tabs value={CLIENT_SKLAND_ENABLED ? inputMode : "maa"} onValueChange={(value) => onInputModeChange(value as "skland" | "maa")}>
                      {CLIENT_SKLAND_ENABLED ? (
                        <TabsList className="h-auto w-full rounded-[4px] sm:w-auto" aria-label="干员数据来源">
                          <TabsTrigger value="skland" className="rounded-[4px]"><Database />森空岛</TabsTrigger>
                          <TabsTrigger value="maa" className="rounded-[4px]"><FileJson />MAA</TabsTrigger>
                        </TabsList>
                      ) : null}
                      {CLIENT_SKLAND_ENABLED ? <TabsContent value="skland" className="pt-4">
                        <div className="setup-import-action flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm">
                              {sklandSnapshot
                                ? sklandSnapshot.roles.find((role) => role.isDefault)?.nickname
                                  ?? sklandSnapshot.roles[0]?.nickname
                                  ?? "森空岛同步"
                                : "森空岛同步"}
                            </strong>
                            {sklandSnapshot ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                <span className="font-number">{sklandSnapshot.operbox.length}</span> 名干员 · <span className="font-number">{formatSyncTime(sklandSnapshot.infrastructure.storeTs)}</span>
                              </span>
                            ) : !sklandConfigured && sklandDisabledReason ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">{sklandDisabledReason}</span>
                            ) : null}
                          </div>
                          {sklandSnapshot && boxSource !== "skland" ? (
                            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                              <Button type="button" variant="ghost" className="h-11" onClick={handleOpenSkland}>
                                重新同步
                              </Button>
                              <Button type="button" className="h-11" onClick={handleUseSklandSnapshot}>
                                使用森空岛数据
                              </Button>
                            </div>
                          ) : (
                            <Button type="button" className="h-11 w-full sm:w-auto" onClick={handleOpenSkland}>
                              <ScanLine />前往森空岛同步
                            </Button>
                          )}
                        </div>
                        {sklandSnapshot?.warnings.length ? (
                          <ul className="mt-3 grid gap-1 text-xs text-amber-700" role="status">
                            {sklandSnapshot.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                          </ul>
                        ) : null}
                      </TabsContent> : null}
                      <TabsContent value="maa" className="grid gap-3 pt-4">
                        <FileDrop fileName={boxSource === "maa" ? fileName : null} onFile={(file) => void importMaaFile(file)} />
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11 w-fit"
                          aria-expanded={showMaaPaste}
                          aria-controls="setup-maa-paste"
                          onClick={() => setShowMaaPaste((current) => !current)}
                        >
                          {showMaaPaste ? "收起 JSON" : "粘贴 JSON"}
                        </Button>
                        {showMaaPaste ? (
                          <div id="setup-maa-paste" className="grid gap-2">
                            <Label htmlFor="setup-maa-json">JSON 内容</Label>
                            <Textarea
                              id="setup-maa-json"
                              value={maaPaste}
                              onChange={(event) => onMaaPasteChange(event.target.value)}
                              placeholder="粘贴 Arknights_OperBox_Export.json 内容"
                              className="min-h-28 resize-y rounded-[4px] font-mono text-base sm:text-sm"
                              aria-invalid={Boolean(inputError)}
                              aria-describedby={inputError ? "setup-box-error" : undefined}
                            />
                            <Button type="button" variant="outline" className="h-10 w-full" disabled={!maaPaste.trim()} onClick={importMaaPaste}>
                              导入 JSON
                            </Button>
                          </div>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                    {inputError ? <p id="setup-box-error" className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </section>
                ) : null}

                {storageNotice ? (
                  <Alert className="rounded-lg border-amber-200 bg-amber-50 text-amber-700" role="status">
                    <AlertDescription className="text-amber-700">
                      {storageNotice.message}（{storageNotice.code}）
                    </AlertDescription>
                  </Alert>
                ) : null}

                <details className="setup-quiet-details">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">数据管理</summary>
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-xs text-muted-foreground">数据在此浏览器保存 <span className="font-number">30</span> 天。</span>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => setClearConfirmOpen(true)}>
                      <Trash2 />清除本地数据
                    </Button>
                  </div>
                </details>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="layout" className="min-h-0 overflow-hidden overscroll-contain">
            <Tabs
              value={layoutSection}
              onValueChange={handleLayoutSectionChange}
              className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0"
            >
              <div className="px-4 pb-3 pt-1 sm:px-7">
                <TabsList variant="line" className="w-full justify-start gap-5 p-0 sm:w-fit" aria-label="基建设置内容">
                  <TabsTrigger value="basics" className="min-h-10 flex-none px-0 text-[13px] sm:px-0">布局与换班</TabsTrigger>
                  <TabsTrigger value="facilities" className="min-h-10 flex-none px-0 text-[13px] sm:px-0">设施设置</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="basics" className="min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div
                    ref={basicsPanelRef}
                    data-setup-layout-basics
                    role="region"
                    aria-label="布局与换班"
                    tabIndex={-1}
                    className="grid gap-6 px-4 py-5 outline-none sm:px-7 sm:py-6"
                  >
                    <section className="grid gap-3" aria-labelledby="setup-preset-title">
                      <h3 id="setup-preset-title" className="text-sm font-semibold">布局预设</h3>
                      <PresetSelector presets={presets} selected={preset} onSelect={handlePresetSelect} />
                    </section>

                    <div className="pt-1">
                      <RotationSettings value={rotationProfile} onChange={onRotationProfileChange} />
                    </div>

                    <details className="setup-quiet-details pt-1">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">高级工具</summary>
                      <div className="grid gap-2 py-3 sm:grid-cols-2">
                        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed text-sm font-medium text-muted-foreground transition-[color,border-color,background-color,scale] duration-150 ease-out active:scale-[0.96] hover:border-primary hover:bg-muted/40 hover:text-primary motion-reduce:transform-none">
                          <Upload className="size-4" />导入布局
                          <input
                            className="sr-only"
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleLayoutFile(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onDownloadLayout}>
                          <FileJson />导出布局
                        </Button>
                        {resultClearWarningDismissed ? (
                          <Button type="button" variant="ghost" className="min-h-11 w-fit" onClick={onRestoreResultClearWarning}>
                            恢复切换提示
                          </Button>
                        ) : null}
                      </div>
                    </details>
                    {inputError ? <p id="setup-layout-error" className="text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="facilities" className="min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div
                    ref={facilitiesPanelRef}
                    data-setup-facilities
                    role="region"
                    aria-label="设施设置"
                    tabIndex={-1}
                    className="px-4 py-5 outline-none sm:px-7 sm:py-6"
                  >
                    <LayoutEditor
                      layout={layout}
                      onFactoryRecipeChange={onFactoryRecipeChange}
                      onTradeOrderChange={onTradeOrderChange}
                      onRoomLevelChange={onRoomLevelChange}
                    />
                    {inputError ? <p className="mt-3 text-sm text-destructive" role="alert">{inputError}</p> : null}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        <footer data-setup-footer className="setup-dialog-footer flex min-h-14 w-full min-w-0 flex-nowrap items-center justify-end gap-1.5 px-2 py-1.5 sm:min-h-16 sm:gap-2 sm:px-7">
          {step === "box" ? (
            <>
              <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={onSkip}>稍后</Button>
              <Button size="dialog" type="button" disabled={!hasBox} onClick={goToBasics}>继续</Button>
            </>
          ) : layoutSection === "basics" ? (
            <>
              <Button className="max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={goToBox}>返回</Button>
              {mustReviewFacilities ? (
                <Button size="dialog" type="button" onClick={reviewFacilities}>检查设施</Button>
              ) : (
                <Button size="dialog" type="button" onClick={onFinish}><Check />完成</Button>
              )}
            </>
          ) : (
            <>
              <Button className="shrink-0 px-4 max-sm:min-w-16 sm:min-w-[88px]" size="dialog" type="button" variant="ghost" onClick={goToBasics}>
                <span className="sm:hidden">返回</span>
                <span className="max-sm:hidden">返回布局</span>
              </Button>
              <span
                className={`min-w-0 flex-1 truncate text-right text-xs tabular-nums sm:text-sm ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}
                role="status"
              >
                <span className={`sm:hidden ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {powerBudget.ok ? "电力正常" : `缺 ${powerBudget.consumed - powerBudget.generated}`}
                </span>
                <span className={`max-sm:hidden ${powerBudget.ok ? "text-emerald-700" : "text-red-600"}`}>
                  {powerBudget.ok
                    ? `电力正常 · ${powerBudget.generated}/${powerBudget.consumed}`
                    : `电力不足 ${powerBudget.consumed - powerBudget.generated} · ${powerBudget.generated}/${powerBudget.consumed}`}
                </span>
              </span>
              <Button className="shrink-0" size="dialog" type="button" disabled={!powerBudget.ok} onClick={onFinish}><Check />完成</Button>
            </>
          )}
        </footer>
      </DialogContent>

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent layer="nested" className="max-w-[min(460px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>清除本地数据？</DialogTitle>
            <DialogDescription>
              {CLIENT_SKLAND_ENABLED
                ? "将删除此浏览器中的布局、干员数据、最近排班和提示偏好。森空岛登录状态不会退出。"
                : "将删除此浏览器中的布局、干员数据、最近排班和提示偏好。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="max-sm:min-w-16 sm:min-w-[88px]" type="button" size="dialog" variant="ghost" onClick={() => setClearConfirmOpen(false)}>保留数据</Button>
            <Button
              type="button"
              size="dialog"
              variant="destructive"
              onClick={() => {
                onClearLocalData();
                setClearConfirmOpen(false);
              }}
            >
              清除本地数据
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
