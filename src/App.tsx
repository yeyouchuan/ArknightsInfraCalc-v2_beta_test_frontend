"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type AppPage } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { InfraCalculator } from "@/components/pages/InfraCalculator";
import { SklandStatus } from "@/components/pages/SklandStatus";
import { TrainingAdvice } from "@/components/pages/TrainingAdvice";

import {
  getHealth,
  getSampleOperbox,
  getSklandSession,
  logoutSkland,
  runPlan,
  saveFeedback,
  selectSklandRole,
  toDisplayError,
} from "./api";
import {
  buildBlueprint,
  computePowerBudget,
  FACTORY_RECIPE_OPTIONS,
  factoryRecipeFor,
  factoryRecipeFromMaaProduct,
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
  ProductChangeConfirmModal,
} from "./components";
import { copyText, downloadJson } from "./download";
import { ONBOARDING_STORAGE_KEY, initialSetupStep, shouldAutoOpenSetup, type SetupStep } from "./onboarding";
import { readOperboxFile, readOperboxText } from "./operbox";
import { normalizeOperboxEntries } from "./operbox-normalization";
import {
  clearLocalProductData,
  loadPersistedSession,
  persistSession,
  RESULT_CLEAR_WARNING_DISMISSED_KEY,
} from "./persistence";
import { planToRows, RoomRow } from "./schedule";
import { DEFAULT_ROTATION_PROFILE } from "./rotation-settings";
import { SetupDialog } from "./setup-dialog";
import { closestShift, compareShifts } from "./skland";
import {
  BaseBlueprint,
  BoxSource,
  BlueprintRoom,
  DisplayError,
  FeedbackData,
  IssueReport,
  OperBoxEntry,
  PublicPlanData,
  PresetDef,
  RotationProfile,
  SklandAccountSummary,
  SklandSessionData,
  SklandSnapshot,
} from "./types";

type ProductChange =
  | { type: "factory"; roomId: string; recipe: FactoryRecipe }
  | { type: "trade"; roomId: string; order: TradeOrder };

function layoutWithProductChange(layout: BaseBlueprint, change: ProductChange): BaseBlueprint {
  return change.type === "factory"
    ? updateFactoryRecipe(layout, change.roomId, change.recipe)
    : updateTradeOrder(layout, change.roomId, change.order);
}

function displayError(code: DisplayError["code"], message: string, retryable = false): DisplayError {
  return { code, message, retryable };
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
  const defaultPreset = PRESETS[0];
  const defaultLayout = buildBlueprint(defaultPreset);
  const [page, setPage] = useState<AppPage>("calculator");
  const [betaRequested, setBetaRequested] = useState(false);
  const [debugToolsEnabled, setDebugToolsEnabled] = useState(false);
  const [hasRestoredSession, setHasRestoredSession] = useState(false);
  const [preset, setPreset] = useState<PresetDef>(defaultPreset);
  const [layout, setLayout] = useState<BaseBlueprint>(defaultLayout);
  const powerBudget = useMemo(() => computePowerBudget(layout), [layout]);
  const [operbox, setOperbox] = useState<OperBoxEntry[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [boxSource, setBoxSource] = useState<BoxSource>("sample");
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [rotationProfile, setRotationProfile] = useState<RotationProfile>(DEFAULT_ROTATION_PROFILE);
  const [inputMode, setInputMode] = useState<"skland" | "maa">("skland");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandSnapshot, setSklandSnapshot] = useState<SklandSnapshot | null>(null);
  const [sklandAccounts, setSklandAccounts] = useState<SklandAccountSummary[]>([]);
  const [sklandActiveAccountId, setSklandActiveAccountId] = useState<string | null>(null);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandSessionLoading, setSklandSessionLoading] = useState(true);
  const [sklandError, setSklandError] = useState<DisplayError | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupInitialStep, setSetupInitialStep] = useState<SetupStep>("box");
  const initialLayoutForRestore = useRef(defaultLayout);
  const initialBoxSource = useRef(boxSource);
  const initialOperbox = useRef(operbox);
  const initialLayoutDirty = useRef(layoutDirty);
  const skipNextPersistence = useRef(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputErrorCode, setInputErrorCode] = useState<DisplayError["code"]>("AIC-BOX-1101");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [result, setResult] = useState<PublicPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cliReady, setCliReady] = useState(false);
  const [apiError, setApiError] = useState<DisplayError | null>(null);
  const [storageNotice, setStorageNotice] = useState<DisplayError | null>(null);
  const [activeShift, setActiveShift] = useState(0);
  const [issueDraftRow, setIssueDraftRow] = useState<RoomRow | null>(null);
  const [issueDraftNote, setIssueDraftNote] = useState("");
  const [savedIssue, setSavedIssue] = useState<{ row: RoomRow; note: string } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackData | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [resultClearNotice, setResultClearNotice] = useState<string | null>(null);
  const [resultClearWarningDismissed, setResultClearWarningDismissed] = useState(false);
  const [pendingProductChange, setPendingProductChange] = useState<ProductChange | null>(null);

  // 公开排班结果只包含产品页面需要的效率、MAA 与轮换数据。
  const scheduleResult = result;
  const activePlan = scheduleResult?.maa.plans?.[activeShift];
  const activeRotationShift = scheduleResult?.rotation.shifts?.[activeShift];
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
    () => compareShifts(scheduleResult?.maa, sklandSnapshot?.infrastructure),
    [scheduleResult?.maa, sklandSnapshot?.infrastructure]
  );
  const closestComparison = useMemo(() => closestShift(shiftComparisons), [shiftComparisons]);
  const sklandLayoutMatches = useMemo(() => {
    const suggestion = sklandSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return false;
    const compact = (value: BaseBlueprint) => value.rooms.map((room) => [room.id, room.kind, room.level, room.product]);
    return JSON.stringify(compact(layout)) === JSON.stringify(compact(suggestion));
  }, [layout, sklandSnapshot?.infrastructure.layoutSuggestion]);
  const canRun = Boolean(operbox && operbox.length > 0 && cliReady);
  const showBetaPanels = betaRequested && debugToolsEnabled;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncBetaPanels = () => setBetaRequested(new URLSearchParams(window.location.search).has("beta"));
    syncBetaPanels();
    window.addEventListener("popstate", syncBetaPanels);
    return () => window.removeEventListener("popstate", syncBetaPanels);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const restored = loadPersistedSession(window.localStorage);
      const warningDismissed = window.localStorage.getItem(RESULT_CLEAR_WARNING_DISMISSED_KEY) === "1";
      setResultClearWarningDismissed(warningDismissed);
      if (restored) {
        const restoredPreset = resolvePreset(PRESETS.find((item) => item.label === restored.presetLabel));
        const restoredLayout = restoreEditableProducts(buildBlueprint(restoredPreset), restored.layout);
        const restoredOperbox = restored.operbox ? normalizeOperboxEntries(restored.operbox) : null;
        setPreset(restoredPreset);
        setLayout(restoredLayout);
        setOperbox(restoredOperbox);
        setFileName(restored.sourceName);
        setBoxSource(restored.boxSource);
        setLayoutDirty(restored.layoutDirty);
        setRotationProfile(restored.rotationProfile);
        setResult(restored.result);
        setActiveShift(restored.activeShift);
        initialLayoutForRestore.current = restoredLayout;
        initialBoxSource.current = restored.boxSource;
        initialOperbox.current = restoredOperbox;
        initialLayoutDirty.current = restored.layoutDirty;
      }
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法读取本地数据，但仍可继续生成排班。"));
    } finally {
      setHasRestoredSession(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredSession || typeof window === "undefined") return;
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      return;
    }
    try {
      persistSession(window.localStorage, {
        presetLabel: preset.label,
        layout,
        operbox,
        sourceName: fileName,
        boxSource,
        layoutDirty,
        rotationProfile,
        result,
        activeShift,
      });
      setStorageNotice(null);
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法保存本地数据，但仍可继续生成排班。"));
    }
  }, [hasRestoredSession, preset, layout, operbox, fileName, boxSource, layoutDirty, rotationProfile, result, activeShift]);

  useEffect(() => {
    if (!hasRestoredSession || typeof window === "undefined") return;
    if (shouldAutoOpenSetup(window.localStorage.getItem(ONBOARDING_STORAGE_KEY), Boolean(initialOperbox.current?.length))) {
      setSetupInitialStep("box");
      setSetupOpen(true);
    }
  }, [hasRestoredSession]);

  useEffect(() => {
    let cancelled = false;
    if (!hasRestoredSession) return;
    setSklandSessionLoading(true);
    void Promise.allSettled([getHealth(), getSklandSession()]).then(([healthResult, sessionResult]) => {
      if (cancelled) return;
      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setSklandConfigured(health.skland.available);
        setSklandDisabledReason(health.skland.message);
        setDebugToolsEnabled(health.features.debugTools);
        if (health.plannerReady) {
          setCliReady(true);
          setApiError(null);
        } else {
          setCliReady(false);
          setApiError(displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true));
        }
      } else {
        setCliReady(false);
        setApiError(toDisplayError(healthResult.reason, "排班服务暂不可用，请稍后重试。"));
      }

      if (sessionResult.status === "fulfilled") {
        const session = sessionResult.value;
        setSklandError(null);
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        setSklandAccounts(session.accounts);
        setSklandActiveAccountId(session.activeAccountId);
        if (session.authenticated && session.snapshot) {
          setSklandSnapshot(session.snapshot);
          if (initialBoxSource.current === "skland" || !initialOperbox.current) {
            setOperbox(normalizeOperboxEntries(session.snapshot.operbox));
            setFileName(session.snapshot.sourceName);
            setBoxSource("skland");
          }
          if (!initialLayoutDirty.current && session.snapshot.infrastructure.layoutSuggestion) {
            const suggestion = session.snapshot.infrastructure.layoutSuggestion;
            setLayout(mergeSklandLayout(initialLayoutForRestore.current, suggestion));
            setPreset(resolvePreset(PRESETS.find((item) => item.label === session.snapshot?.infrastructure.layoutLabel)));
          }
        }
      } else {
        setSklandError(toDisplayError(sessionResult.reason, "森空岛会话恢复失败，请稍后刷新。"));
      }
      setSklandSessionLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredSession]);

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
      setInputErrorCode("AIC-BOX-1101");
      return false;
    }
  }

  function applySklandSnapshot(snapshot: SklandSnapshot, applyLayoutWhenClean = true) {
    setSklandSnapshot(snapshot);
    setOperbox(normalizeOperboxEntries(snapshot.operbox));
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

  function applySklandSession(session: SklandSessionData, applyLayoutWhenClean = true) {
    setSklandAccounts(session.accounts);
    setSklandActiveAccountId(session.activeAccountId);
    if (session.authenticated && session.snapshot) {
      applySklandSnapshot(session.snapshot, applyLayoutWhenClean);
      return;
    }
    setSklandSnapshot(null);
    if (boxSource === "skland") {
      setOperbox(null);
      setFileName(null);
      setBoxSource("sample");
      clearPlanResult();
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
      setInputErrorCode("AIC-BOX-1101");
      return false;
    }
  }

  async function handleSklandRole(accountId: string, uid: string) {
    setSklandBusy(true);
    setSklandError(null);
    try {
      const session = await selectSklandRole(accountId, uid);
      if (!session.authenticated || !session.snapshot) throw new Error("角色切换失败。");
      applySklandSession(session, false);
    } catch (error) {
      const normalized = toDisplayError(error, "角色切换失败，请稍后重试。");
      setSklandError(normalized);
      try {
        const current = await getSklandSession();
        setSklandAccounts(current.accounts);
        setSklandActiveAccountId(current.activeAccountId);
        if (current.authenticated && current.snapshot) applySklandSnapshot(current.snapshot, false);
      } catch {
        // 保留上一份成功快照，等待用户再次操作。
      }
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleSklandLogout() {
    if (!sklandActiveAccountId) return;
    setSklandBusy(true);
    setSklandError(null);
    try {
      const session = await logoutSkland(sklandActiveAccountId);
      applySklandSession(session, false);
    } catch (error) {
      const normalized = toDisplayError(error, "退出森空岛失败，请稍后重试。");
      setSklandError(normalized);
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

  async function runPlanForLayout(planLayout: BaseBlueprint) {
    if (!operbox) return;
    const layoutError = layoutValidationError(planLayout);
    if (layoutError) {
      setApiError(displayError("AIC-LAYOUT-1201", layoutError));
      return;
    }
    if (!cliReady) {
      setApiError(displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true));
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
        layout: planLayout,
        operbox: normalizeOperboxEntries(operbox),
        sourceName: fileName,
        rotation: rotationProfile,
      });
      setResult(response);
      if (response.maa.plans[0]) {
        const plan = response.maa.plans[0];
        const maaFactoryRooms = plan.rooms?.manufacture;
        if (maaFactoryRooms) {
          setLayout((current) => {
            let next = current;
            const factoryLayoutRooms = next.rooms.filter((r) => r.kind === "factory");
            maaFactoryRooms.forEach((maaRoom, index) => {
              const layoutRoom = factoryLayoutRooms[index];
              if (!layoutRoom || !maaRoom.product) return;
              if (factoryRecipeFor(layoutRoom) !== "all") return;
              const recipe = factoryRecipeFromMaaProduct(maaRoom.product);
              if (recipe) {
                next = updateFactoryRecipe(next, layoutRoom.id, recipe);
              }
            });
            return next;
          });
        }
      }
    } catch (error) {
      setApiError(toDisplayError(error, "排班请求失败，请稍后重试。"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRun() {
    await runPlanForLayout(layout);
  }

  async function handleLoadSample(): Promise<boolean> {
    setSampleLoading(true);
    setInputError(null);
    setResult(null);
    clearIssueState();
    try {
      const sample = await getSampleOperbox();
      setOperbox(normalizeOperboxEntries(sample.operbox));
      setFileName(sample.sourceName);
      setBoxSource("sample");
      return true;
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "样例数据读取失败。");
      const normalized = toDisplayError(error, "示例数据读取失败，请稍后重试。");
      setInputErrorCode(normalized.code);
      setApiError(normalized);
      return false;
    } finally {
      setSampleLoading(false);
    }
  }

  function handleDownloadMaa() {
    if (result?.maa) downloadJson("arknights-infra-schedule-maa.json", result.maa);
  }

  function handleDownloadBundle() {
    if (result?.debug?.debugBundle) downloadJson("arknights-infra-debug-bundle.json", result.debug.debugBundle);
  }

  function handleCopyCommand() {
    if (result?.debug?.command) void copyText(result.debug.command);
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
    if (!result?.diagnosticId) {
      setFeedbackError("请先生成排班，再提交问题。");
      return;
    }

    const issue = { row: issueDraftRow, note: issueDraftNote.trim() };

    setFeedbackSaving(true);
    setFeedbackError(null);
    setApiError(null);
    try {
      const response = await saveFeedback({
        diagnosticId: result.diagnosticId,
        room: {
          id: issue.row.roomId,
          title: issue.row.title,
          group: issue.row.group,
          operators: issue.row.operators,
        },
        note: issue.note,
        consent: true,
      });
      setSavedIssue(issue);
      setFeedbackResult(response);
      setIssueOpen(false);
      setIssueDraftRow(null);
      setIssueDraftNote("");
    } catch (error) {
      const normalized = toDisplayError(error, "反馈保存失败，请稍后重试。");
      setFeedbackError(normalized.message);
      setApiError(normalized);
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

  function handleRotationProfileChange(value: RotationProfile) {
    setRotationProfile(value);
    clearPlanResult();
  }

  function applyProductChange(change: ProductChange) {
    setLayout((current) => layoutWithProductChange(current, change));
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
    if (resultClearWarningDismissed || !result) return;
    setResultClearNotice(label ? `已切换到：${label}` : "配置已切换");
  }

  function requestProductChange(change: ProductChange) {
    showResultClearNotice(productChangeLabel(change));
    applyProductChange(change);
  }

  function requestScheduleProductChange(change: ProductChange) {
    if (loading || pendingProductChange) return;
    if (!result) {
      requestProductChange(change);
      return;
    }
    setResultClearNotice(null);
    setPendingProductChange(change);
  }

  async function confirmScheduleProductChange() {
    if (!pendingProductChange || loading) return;
    const nextLayout = layoutWithProductChange(layout, pendingProductChange);
    setLayout(nextLayout);
    setLayoutDirty(true);
    clearPlanResult();
    try {
      await runPlanForLayout(nextLayout);
    } finally {
      setPendingProductChange(null);
    }
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

  function handleScheduleFactoryRecipeChange(roomId: string, recipe: FactoryRecipe) {
    requestScheduleProductChange({ type: "factory", roomId, recipe });
  }

  function handleScheduleTradeOrderChange(roomId: string, order: TradeOrder) {
    requestScheduleProductChange({ type: "trade", roomId, order });
  }

  function handleRoomLevelChange(roomId: string, level: number) {
    setLayout((current) => updateRoomLevel(current, roomId, level));
    setLayoutDirty(true);
    clearPlanResult();
  }

  async function handleLayoutFile(file: File) {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()));
      if (!parsed) throw new Error("布局文件格式无效，请检查房间名称、类型和设施等级。");
      setLayout(parsed);
      setLayoutDirty(true);
      clearPlanResult();
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "布局 JSON 读取失败。");
      setInputErrorCode("AIC-LAYOUT-1201");
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
    if (!next) {
      setInputError(null);
      markOnboardingSeen();
    }
  }

  function closeSetup() {
    markOnboardingSeen();
    setInputError(null);
    setSetupOpen(false);
  }

  function openSklandFromSetup() {
    setInputError(null);
    setSetupOpen(false);
    setPage("skland");
  }

  function handleSklandAuthenticated(session: SklandSessionData) {
    setSklandError(null);
    applySklandSession(session);
  }

  function handleClearLocalData() {
    try {
      clearLocalProductData(window.localStorage, [ONBOARDING_STORAGE_KEY]);
      skipNextPersistence.current = true;
      setPreset(defaultPreset);
      setLayout(buildBlueprint(defaultPreset));
      setOperbox(null);
      setFileName(null);
      setBoxSource("sample");
      setLayoutDirty(false);
      setRotationProfile(DEFAULT_ROTATION_PROFILE);
      setResult(null);
      setActiveShift(0);
      setResultClearWarningDismissed(false);
      setStorageNotice(null);
      clearIssueState();
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法清除本地数据，请检查站点存储权限。"));
    }
  }

  async function handleRetry() {
    if (apiError?.code !== "AIC-PLAN-3001" && canRun) {
      await handleRun();
      return;
    }
    try {
      const health = await getHealth();
      setCliReady(health.plannerReady);
      setDebugToolsEnabled(health.features.debugTools);
      setApiError(
        health.plannerReady
          ? null
          : displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true)
      );
    } catch (error) {
      setApiError(toDisplayError(error, "排班服务暂不可用，请稍后重试。"));
    }
  }

  const issueForPanel = useMemo(
    () => savedIssue ?? (issueDraftRow && issueOpen ? { row: issueDraftRow, note: issueDraftNote } : null),
    [issueDraftNote, issueDraftRow, issueOpen, savedIssue]
  );
  const issueReport = useMemo(
    () => buildIssueReport(issueForPanel, fileName, result?.debug?.command),
    [issueForPanel, fileName, result?.debug?.command]
  );
  const statusError = inputError && !setupOpen
    ? displayError(inputErrorCode, inputError)
    : apiError ?? storageNotice;

  if (!hasRestoredSession) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-6" role="status" aria-live="polite">
        <div className="w-full max-w-md space-y-3" aria-label="正在恢复本地数据">
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          <div className="h-56 animate-pulse rounded-lg bg-muted/70" />
          <span className="sr-only">正在恢复本地数据</span>
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar page={page} onPageChange={setPage} />
      <SidebarInset>
        <AppTopBar
          snapshot={sklandSnapshot}
          sessionLoading={sklandSessionLoading}
          onOpenSkland={() => setPage("skland")}
        />

      <div className="app-content-track py-4">
      {page === "calculator" ? (
        <InfraCalculator
          layout={layout}
          showBetaPanels={showBetaPanels}
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
          loading={loading}
          canRun={canRun}
          plannerReady={cliReady}
          statusError={statusError}
          onLoadSample={handleLoadSample}
          onOpenSetup={openSetup}
          onRun={handleRun}
          onRetry={() => void handleRetry()}
          onCopyDiagnostic={() => {
            if (statusError) void copyText(`${statusError.code}${statusError.requestId ? ` · ${statusError.requestId}` : ""}`);
          }}
          onSetActiveShift={setActiveShift}
          onMarkIssue={handleMarkIssue}
          onFactoryRecipeChange={handleScheduleFactoryRecipeChange}
          onTradeOrderChange={handleScheduleTradeOrderChange}
          onDownloadMaa={handleDownloadMaa}
          onDownloadBundle={handleDownloadBundle}
          onCopyCommand={handleCopyCommand}
          onClearResultNotice={() => setResultClearNotice(null)}
          onDismissResultClearWarning={dismissResultClearWarning}
        />
      ) : page === "skland" ? (
        <SklandStatus
          snapshot={sklandSnapshot}
          accounts={sklandAccounts}
          activeAccountId={sklandActiveAccountId}
          sessionLoading={sklandSessionLoading}
          layoutMatches={sklandLayoutMatches ?? false}
          layoutDirty={layoutDirty}
          configured={sklandConfigured}
          disabledReason={sklandDisabledReason}
          busy={sklandBusy}
          error={sklandError}
          onAuthenticated={handleSklandAuthenticated}
          onRoleChange={handleSklandRole}
          onLogout={handleSklandLogout}
          onApplyLayout={handleApplySklandLayout}
          onContinueSetup={() => {
            setSetupInitialStep("layout");
            setSetupOpen(true);
          }}
          onOpenCalculator={() => setPage("calculator")}
          onCopyUid={(uid) => void copyText(uid)}
        />
      ) : (
        <TrainingAdvice operbox={operbox} layout={layout} profile={result?.profile} onOpenCalculator={() => setPage("calculator")} />
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
        onOpenSkland={openSklandFromSetup}
        onMaaFile={handleFile}
        onMaaPaste={handleMaaPaste}
        presets={PRESETS}
        preset={preset}
        layout={layout}
        rotationProfile={rotationProfile}
        onRotationProfileChange={handleRotationProfileChange}
        onPresetSelect={handlePresetSelect}
        onLayoutFile={handleLayoutFile}
        onDownloadLayout={() => downloadJson(`layout-${layout.template}.json`, layout)}
        onRestoreResultClearWarning={restoreResultClearWarning}
        storageNotice={storageNotice}
        onClearLocalData={handleClearLocalData}
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
      <ProductChangeConfirmModal
        open={Boolean(pendingProductChange)}
        roomLabel={rows.find((row) => row.roomId === pendingProductChange?.roomId)?.title ?? pendingProductChange?.roomId ?? "当前设施"}
        changeKind={pendingProductChange?.type === "trade" ? "贸易策略" : "制造配方"}
        nextValueLabel={pendingProductChange ? productChangeLabel(pendingProductChange) ?? "新配置" : "新配置"}
        busy={loading && Boolean(pendingProductChange)}
        onConfirm={() => void confirmScheduleProductChange()}
        onCancel={() => setPendingProductChange(null)}
      />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default WorkbenchApp;

