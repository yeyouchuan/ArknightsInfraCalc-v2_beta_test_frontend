"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type AppPage } from "@/components/layout/AppSidebar";
import { InfraCalculator } from "@/components/pages/InfraCalculator";
import { SklandStatus } from "@/components/pages/SklandStatus";
import { TrainingAdvice } from "@/components/pages/TrainingAdvice";

import { Button } from "@/components/ui/button";

import {
  getHealth,
  getSampleOperbox,
  getSklandSession,
  logoutSkland,
  runPlan,
  saveFeedback,
  selectSklandRole,
  syncSkland,
} from "./api";
import {
  buildBlueprint,
  computePowerBudget,
  FACTORY_RECIPE_OPTIONS,
  FactoryRecipe,
  PRESETS,
  TRADE_ORDER_OPTIONS,
  TradeOrder,
  updateFactoryRecipe,
  updateRoomLevel,
  updateTradeOrder,
} from "./blueprint";
import {
  IssueNoteModal,
  RunButton,
  StatusBar,
} from "./components";
import { copyText, downloadJson } from "./download";
import { ONBOARDING_STORAGE_KEY, initialSetupStep, shouldAutoOpenSetup, type SetupStep } from "./onboarding";
import { readOperboxFile, readOperboxText } from "./operbox";
import { planToRows, RoomRow } from "./schedule";
import { SetupDialog } from "./setup-dialog";
import { closestShift, compareShifts } from "./skland";
import { SklandAccount } from "./skland-components";
import {
  BaseBlueprint,
  BoxSource,
  BlueprintRoom,
  FeedbackApiResponse,
  IssueReport,
  OperBoxEntry,
  PlanApiResponse,
  PresetDef,
  SklandSnapshot,
} from "./types";

const SESSION_KEY = "arknights-infra-calc-beta-session-v3";
const LEGACY_SESSION_KEY = "arknights-infra-calc-beta-session-v2";
const RESULT_CLEAR_WARNING_DISMISSED_KEY = "arknights-infra-calc-result-clear-warning-dismissed";
const KNOWN_ISSUES = [
  "Beta 测试阶段仍可能出现排班策略和预期不一致的情况；请用“标记问题”提交上下文。",
  "如遇到 CLI 运行失败，请先下载调试包并保留本次运行记录。",
];

type ProductChange =
  | { type: "factory"; roomId: string; recipe: FactoryRecipe }
  | { type: "trade"; roomId: string; order: TradeOrder };

function safeParseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readSessionState() {
  if (typeof window === "undefined") return null;
  return safeParseJson(window.localStorage.getItem(SESSION_KEY)) ?? safeParseJson(window.localStorage.getItem(LEGACY_SESSION_KEY));
}

function readResultClearWarningDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RESULT_CLEAR_WARNING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function resolvePreset(value: PresetDef | undefined): PresetDef {
  return PRESETS.find((preset) => preset.label === value?.label) ?? PRESETS[0];
}

function parseLayoutJson(value: unknown): BaseBlueprint | null {
  if (!value || typeof value !== "object") return null;
  const layout = value as Partial<BaseBlueprint>;
  if (typeof layout.template !== "string" || !Array.isArray(layout.rooms) || !layout.scenario || typeof layout.scenario !== "object") {
    return null;
  }
  const rooms = layout.rooms.map((room) => {
    if (!room || typeof room !== "object" || typeof room.id !== "string" || typeof room.kind !== "string") return null;
    const level = Number((room as BlueprintRoom).level);
    const maxLevel = (room as BlueprintRoom).kind === "control_center" || (room as BlueprintRoom).kind === "dormitory" ? 5 : 3;
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) return null;
    return { ...room, level } as BlueprintRoom;
  });
  if (rooms.some((room) => room === null) || !rooms.some((room) => room?.kind === "control_center")) return null;
  return { ...layout, drone_cap: Number(layout.drone_cap ?? 0), scenario: layout.scenario, rooms: rooms as BlueprintRoom[] } as BaseBlueprint;
}

function layoutValidationError(layout: BaseBlueprint): string | null {
  if (!layout.rooms.some((room) => room.kind === "control_center")) return "布局必须包含控制中枢。";
  const invalid = layout.rooms.find((room) => {
    const maxLevel = room.kind === "control_center" || room.kind === "dormitory" ? 5 : 3;
    return !Number.isInteger(room.level) || room.level < 1 || room.level > maxLevel;
  });
  if (!invalid) return null;
  const maxLevel = invalid.kind === "control_center" || invalid.kind === "dormitory" ? 5 : 3;
  return `${invalid.id} 的设施等级必须在 1–${maxLevel} 之间。`;
}

function restoreEditableProducts(baseLayout: BaseBlueprint, cachedLayout: BaseBlueprint | undefined): BaseBlueprint {
  if (!cachedLayout) return baseLayout;

  const cachedRooms = new Map(cachedLayout.rooms.map((room) => [room.id, room]));
  return {
    ...baseLayout,
    rooms: baseLayout.rooms.map((room) => {
      const cachedRoom = cachedRooms.get(room.id);
      if (room.kind === "factory" && cachedRoom?.kind === "factory" && cachedRoom.product && "factory" in cachedRoom.product) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { factory: { recipe: cachedRoom.product.factory.recipe } },
        };
      }
      if (
        room.kind === "trade_post" &&
        cachedRoom?.kind === "trade_post" &&
        cachedRoom.product &&
        "trade" in cachedRoom.product
      ) {
        return {
          ...room,
          level: Number.isFinite(cachedRoom.level) ? cachedRoom.level : room.level,
          product: { trade: { order: cachedRoom.product.trade.order } },
        };
      }
      return { ...room, level: typeof cachedRoom?.level === "number" ? cachedRoom.level : room.level };
    }),
  };
}

function mergeSklandLayout(current: BaseBlueprint, suggestion: BaseBlueprint): BaseBlueprint {
  return {
    ...suggestion,
    drone_cap: current.drone_cap,
    scenario: structuredClone(current.scenario),
  };
}

function buildIssueReport(
  issue: { row: RoomRow; note: string } | null,
  sourceName: string | null,
  command?: string
): IssueReport | null {
  if (!issue) return null;
  return {
    type: "room_issue",
    sourceName,
    room: {
      title: issue.row.title,
      group: issue.row.group,
      product: issue.row.product,
      operators: issue.row.operators,
      inferredRule: issue.row.rule,
      efficiency: issue.row.efficiency,
      efficiencyLabel: issue.row.efficiencyLabel,
    },
    command,
    note: issue.note,
  };
}

function WorkbenchApp() {
  const initialSession = readSessionState() as
    | {
        preset?: PresetDef;
        layout?: BaseBlueprint;
        operbox?: OperBoxEntry[] | null;
        fileName?: string | null;
        boxSource?: BoxSource;
        layoutDirty?: boolean;
        result?: PlanApiResponse | null;
        activeShift?: number;
        issueOpen?: boolean;
        issueDraftRow?: RoomRow | null;
        issueDraftNote?: string;
        issue?: { row: RoomRow; note: string } | null;
        feedback?: FeedbackApiResponse | null;
      }
    | null;

  const initialPreset = resolvePreset(initialSession?.preset);
  const initialLayout = restoreEditableProducts(buildBlueprint(initialPreset), initialSession?.layout);
  const [page, setPage] = useState<AppPage>("calculator");
  const [preset, setPreset] = useState<PresetDef>(initialPreset);
  const [layout, setLayout] = useState<BaseBlueprint>(initialLayout);
  const powerBudget = useMemo(() => computePowerBudget(layout), [layout]);
  const [operbox, setOperbox] = useState<OperBoxEntry[] | null>(initialSession?.operbox ?? null);
  const [fileName, setFileName] = useState<string | null>(initialSession?.fileName ?? null);
  const [boxSource, setBoxSource] = useState<BoxSource>(initialSession?.boxSource ?? (initialSession?.operbox ? "maa" : "sample"));
  const [layoutDirty, setLayoutDirty] = useState(initialSession?.layoutDirty ?? Boolean(initialSession?.layout));
  const [inputMode, setInputMode] = useState<"skland" | "maa">("skland");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandSnapshot, setSklandSnapshot] = useState<SklandSnapshot | null>(null);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupInitialStep, setSetupInitialStep] = useState<SetupStep>("box");
  const [sklandAccountOpen, setSklandAccountOpen] = useState(false);
  const resumeSetupAfterSkland = useRef(false);
  const initialLayoutForRestore = useRef(initialLayout);
  const initialBoxSource = useRef(boxSource);
  const initialOperbox = useRef(operbox);
  const initialLayoutDirty = useRef(layoutDirty);
  const [inputError, setInputError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [result, setResult] = useState<PlanApiResponse | null>(initialSession?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliReady, setCliReady] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState(initialSession?.activeShift ?? 0);
  const [issueDraftRow, setIssueDraftRow] = useState<RoomRow | null>(
    initialSession?.issueDraftRow ?? initialSession?.issue?.row ?? null
  );
  const [issueDraftNote, setIssueDraftNote] = useState(
    initialSession?.issueDraftNote ?? initialSession?.issue?.note ?? ""
  );
  const [savedIssue, setSavedIssue] = useState<{ row: RoomRow; note: string } | null>(
    initialSession?.issue ?? null
  );
  const [issueOpen, setIssueOpen] = useState(initialSession?.issueOpen ?? false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackApiResponse | null>(initialSession?.feedback ?? null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [resultClearNotice, setResultClearNotice] = useState<string | null>(null);
  const [resultClearWarningDismissed, setResultClearWarningDismissed] = useState(readResultClearWarningDismissed);

  const scheduleResult = result?.success ? result : null;
  const activePlan = scheduleResult?.maaJson?.plans?.[activeShift];
  const activeRotationShift = scheduleResult?.rotationJson?.shifts?.[activeShift];
  const rows = useMemo(() => planToRows(activePlan, activeRotationShift, layout), [activePlan, activeRotationShift, layout]);
  const currentMoraleByOperator = useMemo(() => {
    if (boxSource !== "skland" || !sklandSnapshot) return undefined;

    return new Map(
      sklandSnapshot.infrastructure.rooms.flatMap((room) =>
        room.operators.map((operator) => [operator.name, operator.morale] as const)
      )
    );
  }, [boxSource, sklandSnapshot]);
  const shiftComparisons = useMemo(
    () => compareShifts(scheduleResult?.maaJson, sklandSnapshot?.infrastructure),
    [scheduleResult?.maaJson, sklandSnapshot?.infrastructure]
  );
  const closestComparison = useMemo(() => closestShift(shiftComparisons), [shiftComparisons]);
  const sklandLayoutMatches = useMemo(() => {
    const suggestion = sklandSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return false;
    const compact = (value: BaseBlueprint) => value.rooms.map((room) => [room.id, room.kind, room.level, room.product]);
    return JSON.stringify(compact(layout)) === JSON.stringify(compact(suggestion));
  }, [layout, sklandSnapshot?.infrastructure.layoutSuggestion]);
  const canRun = Boolean(operbox && operbox.length > 0 && cliReady);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const session = {
      preset,
      layout,
      operbox,
      fileName,
      boxSource,
      layoutDirty,
      result: result?.success ? result : null,
      activeShift,
      issueOpen,
      issueDraftRow,
      issueDraftNote,
      issue: savedIssue,
      feedback: feedbackResult,
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.warn("Failed to persist workbench session", error);
    }
  }, [preset, layout, operbox, fileName, boxSource, layoutDirty, result, activeShift, issueOpen, issueDraftRow, issueDraftNote, savedIssue, feedbackResult]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldAutoOpenSetup(window.localStorage.getItem(ONBOARDING_STORAGE_KEY), Boolean(initialOperbox.current?.length))) {
      setSetupInitialStep("box");
      setSetupOpen(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getHealth(), getSklandSession()]).then(([healthResult, sessionResult]) => {
      if (cancelled) return;
      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setSklandConfigured(Boolean(health.sklandConfigured));
        setSklandDisabledReason(health.sklandDisabledReason ?? null);
        if (health.ok && health.cliReady) {
          setCliPath(health.cliPath ?? null);
          setCliReady(true);
          setApiError(null);
        } else {
          setCliReady(false);
          setCliPath(health.cliPath ?? null);
          setApiError(health.serveError ?? health.error ?? "API 正常，但未找到可执行的 infra-cli。");
        }
      } else {
        setCliReady(false);
        setApiError(healthResult.reason instanceof Error ? healthResult.reason.message : "本地 API 服务不可用。");
      }

      if (sessionResult.status === "fulfilled") {
        const session = sessionResult.value;
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        if (session.authenticated && session.snapshot) {
          setSklandSnapshot(session.snapshot);
          if (initialBoxSource.current === "skland" || !initialOperbox.current) {
            setOperbox(session.snapshot.operbox);
            setFileName(session.snapshot.sourceName);
            setBoxSource("skland");
          }
          if (!initialLayoutDirty.current && session.snapshot.infrastructure.layoutSuggestion) {
            const suggestion = session.snapshot.infrastructure.layoutSuggestion;
            setLayout(mergeSklandLayout(initialLayoutForRestore.current, suggestion));
            setPreset(resolvePreset(PRESETS.find((item) => item.label === session.snapshot?.infrastructure.layoutLabel)));
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File): Promise<boolean> {
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const entries = await readOperboxFile(file);
      setOperbox(entries);
      setFileName(file.name);
      setBoxSource("maa");
      return true;
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "练度文件解析失败。");
      return false;
    }
  }

  function applySklandSnapshot(snapshot: SklandSnapshot, applyLayoutWhenClean = true) {
    setSklandSnapshot(snapshot);
    setOperbox(snapshot.operbox);
    setFileName(snapshot.sourceName);
    setBoxSource("skland");
    setInputMode("skland");
    clearPlanResult();
    if (applyLayoutWhenClean && !layoutDirty && snapshot.infrastructure.layoutSuggestion) {
      setLayout((current) => mergeSklandLayout(current, snapshot.infrastructure.layoutSuggestion as BaseBlueprint));
      setPreset(resolvePreset(PRESETS.find((item) => item.label === snapshot.infrastructure.layoutLabel)));
      setLayoutDirty(false);
    }
  }

  function handleMaaPaste(): boolean {
    setInputError(null);
    try {
      const entries = readOperboxText(maaPaste);
      setOperbox(entries);
      setFileName("粘贴的 Arknights_OperBox_Export.json");
      setBoxSource("maa");
      clearPlanResult();
      return true;
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "MAA JSON 解析失败。");
      return false;
    }
  }

  async function handleSklandRefresh() {
    setSklandBusy(true);
    setInputError(null);
    try {
      const session = await syncSkland();
      if (!session.authenticated || !session.snapshot) throw new Error(session.error ?? "森空岛同步失败。");
      applySklandSnapshot(session.snapshot, false);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "森空岛同步失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleSklandRole(uid: string) {
    setSklandBusy(true);
    setInputError(null);
    try {
      const session = await selectSklandRole(uid);
      if (!session.authenticated || !session.snapshot) throw new Error(session.error ?? "角色切换失败。");
      applySklandSnapshot(session.snapshot, false);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "角色切换失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleSklandLogout() {
    setSklandBusy(true);
    setInputError(null);
    try {
      await logoutSkland();
      setSklandSnapshot(null);
      if (boxSource === "skland") {
        setOperbox(null);
        setFileName(null);
        setBoxSource("sample");
        clearPlanResult();
      }
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "退出森空岛失败。");
    } finally {
      setSklandBusy(false);
    }
  }

  function handleApplySklandLayout() {
    const suggestion = sklandSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return;
    setLayout((current) => mergeSklandLayout(current, suggestion));
    setPreset(resolvePreset(PRESETS.find((item) => item.label === sklandSnapshot.infrastructure.layoutLabel)));
    setLayoutDirty(false);
    clearPlanResult();
  }

  async function handleRun() {
    if (!operbox) return;
    const layoutError = layoutValidationError(layout);
    if (layoutError) {
      setApiError(layoutError);
      return;
    }
    if (!cliReady) {
      setApiError("当前没有可运行的 infra-cli；Windows 本地请设置 INFRA_CLI_PATH 指向 infra-cli.exe。");
      return;
    }
    setLoading(true);
    setResultClearNotice(null);
    setInputError(null);
    setApiError(null);
    setResult(null);
    setActiveShift(0);
    clearIssueState();

    try {
      const response = await runPlan({
        layout,
        operbox,
        sourceName: fileName,
      });
      setResult(response);
      if (!response.success) {
        setApiError(response.error ?? "infra-cli 没有成功生成排班。");
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "排班请求失败。");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSample(): Promise<boolean> {
    setSampleLoading(true);
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const sample = await getSampleOperbox();
      if (!sample.success || !sample.operbox) {
        throw new Error(sample.error ?? "样例数据读取失败。");
      }
      setOperbox(sample.operbox);
      setFileName(sample.sourceName ?? "243 全精二样例");
      setBoxSource("sample");
      return true;
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "样例数据读取失败。");
      return false;
    } finally {
      setSampleLoading(false);
    }
  }

  function handleDownloadMaa() {
    if (result?.maaJson) downloadJson("infra-calc-beta-maa.json", result.maaJson);
  }

  function handleDownloadBundle() {
    if (result?.debugBundle) downloadJson("infra-calc-beta-debug-bundle.json", result.debugBundle);
  }

  function handleCopyCommand() {
    if (result?.command) void copyText(result.command);
  }

  function clearIssueState() {
    setIssueDraftRow(null);
    setIssueDraftNote("");
    setSavedIssue(null);
    setIssueOpen(false);
    setFeedbackResult(null);
    setFeedbackError(null);
  }

  function handleMarkIssue(row: RoomRow) {
    setIssueDraftRow(row);
    setIssueDraftNote("");
    setSavedIssue(null);
    setFeedbackResult(null);
    setFeedbackError(null);
    setIssueOpen(true);
  }

  async function handleSaveIssue() {
    if (!issueDraftRow || !issueDraftNote.trim()) return;
    if (!operbox || operbox.length === 0) {
      setFeedbackError("请先上传或载入 operbox。");
      return;
    }

    const issue = { row: issueDraftRow, note: issueDraftNote.trim() };
    const report = buildIssueReport(issue, fileName, result?.debugBundle?.command);
    if (!report) return;

    setFeedbackSaving(true);
    setFeedbackError(null);
    setApiError(null);
    try {
      const response = await saveFeedback({
        issue: report,
        operbox,
        sourceName: fileName,
        debugBundle: result?.debugBundle,
      });
      if (!response.success) {
        throw new Error(response.error ?? "反馈保存失败。");
      }
      setSavedIssue(issue);
      setFeedbackResult(response);
      setIssueOpen(false);
      setIssueDraftRow(null);
      setIssueDraftNote("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "反馈保存失败。";
      setFeedbackError(message);
      setApiError(message);
    } finally {
      setFeedbackSaving(false);
    }
  }

  function handleCancelIssue() {
    setIssueOpen(false);
    setIssueDraftRow(null);
    setIssueDraftNote("");
  }

  function clearPlanResult() {
    setResult(null);
    setActiveShift(0);
    clearIssueState();
  }

  function applyProductChange(change: ProductChange) {
    if (change.type === "factory") {
      setLayout((current) => updateFactoryRecipe(current, change.roomId, change.recipe));
    } else {
      setLayout((current) => updateTradeOrder(current, change.roomId, change.order));
    }
    setLayoutDirty(true);
    clearPlanResult();
  }

  function productChangeLabel(change: ProductChange) {
    if (change.type === "factory") {
      return FACTORY_RECIPE_OPTIONS.find((option) => option.recipe === change.recipe)?.label;
    }
    return TRADE_ORDER_OPTIONS.find((option) => option.order === change.order)?.label;
  }

  function showResultClearNotice(label: string | undefined) {
    if (resultClearWarningDismissed || !result?.success) return;
    setResultClearNotice(label ? `已切换到：${label}` : "配置已切换");
  }

  function requestProductChange(change: ProductChange) {
    showResultClearNotice(productChangeLabel(change));
    applyProductChange(change);
  }

  function dismissResultClearWarning() {
    setResultClearWarningDismissed(true);
    setResultClearNotice(null);
    try {
      window.localStorage.setItem(RESULT_CLEAR_WARNING_DISMISSED_KEY, "1");
    } catch {
      // The current session can still honor the preference when storage is unavailable.
    }
  }

  function restoreResultClearWarning() {
    setResultClearWarningDismissed(false);
    try {
      window.localStorage.removeItem(RESULT_CLEAR_WARNING_DISMISSED_KEY);
    } catch {
      // The in-memory preference has already been restored.
    }
  }

  function handlePresetSelect(nextPreset: PresetDef) {
    showResultClearNotice(`布局 ${nextPreset.label}`);
    setPreset(nextPreset);
    setLayout(buildBlueprint(nextPreset));
    setLayoutDirty(true);
    clearPlanResult();
  }

  function handleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    requestProductChange({ type: "factory", roomId, recipe });
  }

  function handleTradeOrderChange(roomId: string, order: TradeOrder) {
    requestProductChange({ type: "trade", roomId, order });
  }

  function handleRoomLevelChange(roomId: string, level: number) {
    setLayout((current) => updateRoomLevel(current, roomId, level));
    setLayoutDirty(true);
    clearPlanResult();
  }

  async function handleLayoutFile(file: File) {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()));
      if (!parsed) throw new Error("layout JSON 格式无效：需要 rooms[].id、kind 和合法的设施等级。");
      setLayout(parsed);
      setLayoutDirty(true);
      clearPlanResult();
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "布局 JSON 读取失败。");
    }
  }

  function markOnboardingSeen() {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch (error) {
      console.warn("Failed to persist onboarding state", error);
    }
  }

  function openSetup() {
    setSetupInitialStep(initialSetupStep(Boolean(operbox?.length)));
    setSetupOpen(true);
  }

  function handleSetupOpenChange(next: boolean) {
    setSetupOpen(next);
    if (!next) markOnboardingSeen();
  }

  function closeSetup() {
    markOnboardingSeen();
    setSetupOpen(false);
  }

  function openSklandFromSetup() {
    resumeSetupAfterSkland.current = true;
    setSetupOpen(false);
    setSklandAccountOpen(true);
  }

  function handleSklandAccountOpenChange(next: boolean) {
    setSklandAccountOpen(next);
    if (!next && resumeSetupAfterSkland.current) {
      resumeSetupAfterSkland.current = false;
      setSetupInitialStep("box");
      setSetupOpen(true);
    }
  }

  function handleSklandAuthenticated(snapshot: SklandSnapshot) {
    applySklandSnapshot(snapshot);
    if (resumeSetupAfterSkland.current) {
      resumeSetupAfterSkland.current = false;
      setSetupInitialStep("layout");
      setSetupOpen(true);
    }
  }

  function handleUseCurrentSklandBox() {
    if (sklandSnapshot) applySklandSnapshot(sklandSnapshot, false);
  }

  const issueForPanel = useMemo(
    () => savedIssue ?? (issueDraftRow && issueOpen ? { row: issueDraftRow, note: issueDraftNote } : null),
    [issueDraftNote, issueDraftRow, issueOpen, savedIssue]
  );
  const issueReport = useMemo(
    () => buildIssueReport(issueForPanel, fileName, result?.debugBundle?.command),
    [issueForPanel, fileName, result?.debugBundle?.command]
  );

  return (
    <SidebarProvider>
      <AppSidebar page={page} onPageChange={setPage} />
      <SidebarInset>
        <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-5">
          <h1 className="sr-only">明日方舟基建排班验收工作台</h1>
          <div className="flex items-center gap-2">
            <SidebarTrigger className="h-10 w-10 shrink-0" />
            <div className="grid w-full grid-cols-[minmax(160px,1fr)_auto_auto_auto] items-center gap-2 max-sm:grid-cols-3">
              <StatusBar loading={loading} result={result} error={inputError ?? apiError} cliPath={cliPath} />
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-0 px-3 max-sm:w-full"
            aria-label="配置 Box 与布局"
            onClick={openSetup}
          >
            <Settings2 />
            <span className="hidden md:inline">配置 Box 与布局</span>
            <span className="md:hidden">配置</span>
          </Button>
          <SklandAccount
            open={sklandAccountOpen}
            onOpenChange={handleSklandAccountOpenChange}
            configured={sklandConfigured}
            disabledReason={sklandDisabledReason}
            snapshot={sklandSnapshot}
            busy={sklandBusy}
            onAuthenticated={handleSklandAuthenticated}
            onRefresh={handleSklandRefresh}
            onRoleChange={handleSklandRole}
            onLogout={handleSklandLogout}
          />
          <RunButton canRun={canRun} loading={loading} onRun={handleRun} />
            </div>
        </div>
      </header>

      <div className="px-4 py-4 sm:px-5">
      {page === "calculator" ? (
        <InfraCalculator
          operbox={operbox}
          layout={layout}
          sklandSnapshot={sklandSnapshot}
          sklandLayoutMatches={sklandLayoutMatches}
          result={result}
          scheduleResult={scheduleResult}
          activeShift={activeShift}
          rows={rows}
          currentMoraleByOperator={currentMoraleByOperator}
          activePlan={activePlan}
          closestComparison={closestComparison}
          resultClearNotice={resultClearNotice}
          issueForPanel={issueForPanel}
          issueReport={issueReport}
          feedbackResult={feedbackResult}
          feedbackError={feedbackError}
          sampleLoading={sampleLoading}
          onLoadSample={handleLoadSample}
          onOpenSetup={openSetup}
          onSetActiveShift={setActiveShift}
          onMarkIssue={handleMarkIssue}
          onFactoryRecipeChange={handleFactoryRecipeChange}
          onTradeOrderChange={handleTradeOrderChange}
          onApplySklandLayout={handleApplySklandLayout}
          onDownloadMaa={handleDownloadMaa}
          onDownloadBundle={handleDownloadBundle}
          onCopyCommand={handleCopyCommand}
          onClearResultNotice={() => setResultClearNotice(null)}
          onDismissResultClearWarning={dismissResultClearWarning}
        />
      ) : page === "skland" ? (
        <SklandStatus
          snapshot={sklandSnapshot}
          layoutMatches={sklandLayoutMatches ?? false}
          onApplyLayout={handleApplySklandLayout}
        />
      ) : (
        <TrainingAdvice />
      )}
      </div>

      <SetupDialog
        open={setupOpen}
        initialStep={setupInitialStep}
        onOpenChange={handleSetupOpenChange}
        operbox={operbox}
        boxSource={boxSource}
        fileName={fileName}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        maaPaste={maaPaste}
        onMaaPasteChange={setMaaPaste}
        inputError={inputError}
        resultClearWarningDismissed={resultClearWarningDismissed}
        sklandSnapshot={sklandSnapshot}
        sklandConfigured={sklandConfigured}
        sklandDisabledReason={sklandDisabledReason}
        sklandBusy={sklandBusy}
        onOpenSkland={openSklandFromSetup}
        onRefreshSkland={handleSklandRefresh}
        onUseSkland={handleUseCurrentSklandBox}
        onMaaFile={handleFile}
        onMaaPaste={handleMaaPaste}
        presets={PRESETS}
        preset={preset}
        layout={layout}
        onPresetSelect={handlePresetSelect}
        onLayoutFile={handleLayoutFile}
        onDownloadLayout={() => downloadJson(`layout-${layout.template}.json`, layout)}
        onRestoreResultClearWarning={restoreResultClearWarning}
        onFactoryRecipeChange={handleFactoryRecipeChange}
        onTradeOrderChange={handleTradeOrderChange}
        onRoomLevelChange={handleRoomLevelChange}
        powerBudget={powerBudget}
        onFinish={closeSetup}
        onSkip={closeSetup}
      />

      <IssueNoteModal
        open={issueOpen}
        row={issueDraftRow}
        note={issueDraftNote}
        saving={feedbackSaving}
        onNoteChange={setIssueDraftNote}
        onSave={handleSaveIssue}
        onCancel={handleCancelIssue}
      />

      <aside
        className="fixed bottom-4 right-4 z-30 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-amber-200 bg-background/95 p-3 text-sm shadow-lg backdrop-blur"
        aria-label="目前已知问题"
      >
        <strong className="block text-sm font-medium">目前已知问题</strong>
        <ul className="mt-2 grid gap-1 pl-4 text-xs leading-5 text-muted-foreground">
          {KNOWN_ISSUES.map((issue) => (
            <li key={issue} className="list-disc">
              {issue}
            </li>
          ))}
        </ul>
      </aside>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default WorkbenchApp;

