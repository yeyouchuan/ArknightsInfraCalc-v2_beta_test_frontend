"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type AppPage } from "@/components/layout/AppSidebar";
import { AppTopBar, SklandAccountControl } from "@/components/layout/AppTopBar";
import { InfraCalculator } from "@/components/pages/InfraCalculator";
import { SklandStatus } from "@/components/pages/SklandStatus";
import { LiveActivity, usePlanActivity } from "@/components/ui/live-activity";

import {
  deleteAllSklandData,
  getHealth,
  getSampleOperbox,
  getSklandSession,
  getSklandStatus,
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
import { copyText, downloadJson } from "./download";
import { ONBOARDING_STORAGE_KEY, initialSetupStep, shouldAutoOpenSetup, type SetupStep } from "./onboarding";
import { readOperboxFile, readOperboxText } from "./operbox";
import { normalizeOperboxEntries } from "./operbox-normalization";
import {
  applyLocalLayoutPatch,
  clearLocalProductData,
  loadPersistedSession,
  persistSession,
  RESULT_CLEAR_WARNING_DISMISSED_KEY,
} from "./persistence";
import { planToRows, RoomRow } from "./schedule";
import { DEFAULT_ROTATION_PROFILE } from "./rotation-settings";
import { readPlanHistory, writePlanHistory, type PlanHistoryEntry } from "./plan-history";
import { closestShift, compareShifts } from "./skland";
import { setupConfigurationFingerprint } from "./setup-configuration";
import { applyFiammettaSettings, scheduledOperatorNames, validateFiammettaExport } from "./fiammetta-settings";
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
  SklandScheduleSnapshot,
  SklandStatusSnapshot,
} from "./types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

function DeferredPageLoading() {
  return (
    <div className="grid min-h-64 place-items-center" role="status" aria-live="polite">
      <span className="text-sm text-muted-foreground">正在加载页面…</span>
    </div>
  );
}

const TrainingAdvice = dynamic(
  () => import("@/components/pages/TrainingAdvice").then((module) => module.TrainingAdvice),
  { loading: DeferredPageLoading, ssr: false },
);
const SkillQuery = dynamic(
  () => import("@/components/pages/SkillQuery").then((module) => module.SkillQuery),
  { loading: DeferredPageLoading, ssr: false },
);
const SetupDialog = dynamic(
  () => import("./setup-dialog").then((module) => module.SetupDialog),
  { ssr: false },
);
const IssueNoteModal = dynamic(
  () => import("./components").then((module) => module.IssueNoteModal),
  { ssr: false },
);
const ProductChangeConfirmModal = dynamic(
  () => import("./components").then((module) => module.ProductChangeConfirmModal),
  { ssr: false },
);

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

async function eligibleFiammettaTargetsFor(
  operbox: OperBoxEntry[],
  maa: PublicPlanData["maa"],
): Promise<ReadonlySet<string>> {
  const { operatorBuildingSkillList } = await import("./operatorPortraits");
  const scheduled = scheduledOperatorNames(maa);
  return new Set(
    operbox
      .filter((operator) => operator.own && scheduled.has(operator.name) && operatorBuildingSkillList(operator.name).length > 0)
      .map((operator) => operator.name),
  );
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
  const [layoutSource, setLayoutSource] = useState<"local" | "skland">("local");
  const [localLayoutBackup, setLocalLayoutBackup] = useState<BaseBlueprint | null>(null);
  const [rotationProfile, setRotationProfile] = useState<RotationProfile>(DEFAULT_ROTATION_PROFILE);
  const [fiammettaEnabled, setFiammettaEnabled] = useState(false);
  const [fiammettaTarget, setFiammettaTarget] = useState<string | null>(null);
  const [fiammettaOrder, setFiammettaOrder] = useState<"pre" | "post">("pre");
  const [inputMode, setInputMode] = useState<"skland" | "maa">(CLIENT_SKLAND_ENABLED ? "skland" : "maa");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandScheduleSnapshot, setSklandScheduleSnapshot] = useState<SklandScheduleSnapshot | null>(null);
  const [sklandStatusSnapshot, setSklandStatusSnapshot] = useState<SklandStatusSnapshot | null>(null);
  const [sklandStatusReloadKey, setSklandStatusReloadKey] = useState(0);
  const [sklandAccounts, setSklandAccounts] = useState<SklandAccountSummary[]>([]);
  const [sklandActiveAccountId, setSklandActiveAccountId] = useState<string | null>(null);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandSessionLoading, setSklandSessionLoading] = useState(CLIENT_SKLAND_ENABLED);
  const [sklandError, setSklandError] = useState<DisplayError | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMounted, setSetupMounted] = useState(false);
  const [issueModalMounted, setIssueModalMounted] = useState(false);
  const [productModalMounted, setProductModalMounted] = useState(false);
  const [setupInitialStep, setSetupInitialStep] = useState<SetupStep>("box");
  const initialLayoutForRestore = useRef(defaultLayout);
  const initialBoxSource = useRef(boxSource);
  const initialOperbox = useRef(operbox);
  const initialLayoutDirty = useRef(layoutDirty);
  const initialLayoutSource = useRef<"local" | "skland">("local");
  const initialLocalLayoutBackup = useRef<BaseBlueprint | null>(null);
  const skipNextPersistence = useRef(false);
  const statusLoadingAccount = useRef<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputErrorCode, setInputErrorCode] = useState<DisplayError["code"]>("AIC-BOX-1101");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [result, setResult] = useState<PublicPlanData | null>(null);
  const [previousResult, setPreviousResult] = useState<PublicPlanData | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const planAbortRef = useRef<AbortController | null>(null);
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
  const scheduledOperators = useMemo(() => scheduledOperatorNames(scheduleResult?.maa), [scheduleResult?.maa]);
  const ownsFiammetta = Boolean(operbox?.some((operator) => operator.own && operator.name === "菲亚梅塔"));
  const setupConfigurationKey = useMemo(() => setupConfigurationFingerprint({
    layout,
    rotationProfile,
    fiammettaEnabled,
    fiammettaTarget,
    fiammettaOrder,
  }), [fiammettaEnabled, fiammettaOrder, fiammettaTarget, layout, rotationProfile]);
  const changedRoomIds = useMemo(() => {
    const previousPlan = previousResult?.maa.plans?.[activeShift];
    if (!previousPlan || !activePlan) return new Set<string>();
    const before = new Map(planToRows(previousPlan, previousResult?.rotation.shifts?.[activeShift], layout).map((row) => [row.roomId, JSON.stringify([row.operators, row.efficiency])]));
    return new Set(rows.filter((row) => before.get(row.roomId) !== JSON.stringify([row.operators, row.efficiency])).map((row) => row.roomId));
  }, [activePlan, activeShift, layout, previousResult, rows]);
  const currentMoraleByOperator = useMemo(() => {
    if (!CLIENT_SKLAND_ENABLED || boxSource !== "skland" || !sklandScheduleSnapshot) return undefined;

    return new Map(
      sklandScheduleSnapshot.infrastructure.rooms.flatMap((room) =>
        room.operators.map((operator) => [operator.name, operator.morale] as const)
      )
    );
  }, [boxSource, sklandScheduleSnapshot]);
  const shiftComparisons = useMemo(
    () => CLIENT_SKLAND_ENABLED
      ? compareShifts(scheduleResult?.maa, sklandScheduleSnapshot?.infrastructure)
      : [],
    [scheduleResult?.maa, sklandScheduleSnapshot?.infrastructure]
  );
  const closestComparison = useMemo(
    () => CLIENT_SKLAND_ENABLED ? closestShift(shiftComparisons) : null,
    [shiftComparisons]
  );
  const sklandLayoutMatches = useMemo(() => {
    if (!CLIENT_SKLAND_ENABLED) return false;
    const suggestion = sklandScheduleSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return false;
    const compact = (value: BaseBlueprint) => value.rooms.map((room) => [room.id, room.kind, room.level, room.product]);
    return JSON.stringify(compact(layout)) === JSON.stringify(compact(suggestion));
  }, [layout, sklandScheduleSnapshot?.infrastructure.layoutSuggestion]);
  const activeSklandAccount = useMemo(
    () => CLIENT_SKLAND_ENABLED
      ? sklandAccounts.find((account) => account.accountId === sklandActiveAccountId) ?? null
      : null,
    [sklandAccounts, sklandActiveAccountId]
  );
  const canRun = Boolean(operbox && operbox.length > 0 && cliReady);
  const showBetaPanels = betaRequested && debugToolsEnabled;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncBetaPanels = () => setBetaRequested(new URLSearchParams(window.location.search).has("beta"));
    syncBetaPanels();
    window.addEventListener("popstate", syncBetaPanels);
    return () => window.removeEventListener("popstate", syncBetaPanels);
  }, []);

  useEffect(() => setPlanHistory(readPlanHistory(window.localStorage)), []);

  useEffect(() => {
    if (setupOpen) setSetupMounted(true);
  }, [setupOpen]);

  useEffect(() => {
    if (issueOpen) setIssueModalMounted(true);
  }, [issueOpen]);

  useEffect(() => {
    if (pendingProductChange) setProductModalMounted(true);
  }, [pendingProductChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && loading) planAbortRef.current?.abort();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading]);

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
        const restoreAsLocalImport = !CLIENT_SKLAND_ENABLED && restored.boxSource === "skland";
        const restoredBoxSource = restoreAsLocalImport ? "maa" : restored.boxSource;
        const restoredSourceName = restoreAsLocalImport ? "已保存的干员数据" : restored.sourceName;
        const restoredLayoutSource = CLIENT_SKLAND_ENABLED ? restored.layoutSource : "local";
        setOperbox(restoredOperbox);
        setFileName(restoredSourceName);
        setBoxSource(restoredBoxSource);
        setLayoutDirty(restored.layoutDirty);
        setLayoutSource(restoredLayoutSource);
        setLocalLayoutBackup(CLIENT_SKLAND_ENABLED ? restored.localLayoutBackup : null);
        setRotationProfile(restored.rotationProfile);
        setFiammettaEnabled(Boolean(restored.fiammettaEnabled));
        setFiammettaTarget(restored.fiammettaTarget ?? null);
        setFiammettaOrder(restored.fiammettaOrder === "post" ? "post" : "pre");
        setResult(restored.result);
        setActiveShift(restored.activeShift);
        initialLayoutForRestore.current = restoredLayout;
        initialBoxSource.current = restoredBoxSource;
        initialOperbox.current = restoredOperbox;
        initialLayoutDirty.current = restored.layoutDirty;
        initialLayoutSource.current = restoredLayoutSource;
        initialLocalLayoutBackup.current = CLIENT_SKLAND_ENABLED ? restored.localLayoutBackup : null;
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
        layoutSource,
        localLayoutBackup,
        rotationProfile,
        fiammettaEnabled,
        fiammettaTarget,
        fiammettaOrder,
        result,
        activeShift,
      });
      setStorageNotice(null);
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法保存本地数据，但仍可继续生成排班。"));
    }
  }, [hasRestoredSession, preset, layout, operbox, fileName, boxSource, layoutDirty, layoutSource, localLayoutBackup, rotationProfile, fiammettaEnabled, fiammettaTarget, fiammettaOrder, result, activeShift]);

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
    setSklandSessionLoading(CLIENT_SKLAND_ENABLED);
    const sessionRequest = CLIENT_SKLAND_ENABLED ? getSklandSession() : Promise.resolve(null);
    void Promise.allSettled([getHealth(), sessionRequest]).then(([healthResult, sessionResult]) => {
      if (cancelled) return;
      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setSklandConfigured(Boolean(CLIENT_SKLAND_ENABLED && health.skland?.available));
        setSklandDisabledReason(CLIENT_SKLAND_ENABLED ? health.skland?.message ?? null : null);
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

      if (CLIENT_SKLAND_ENABLED && sessionResult.status === "fulfilled" && sessionResult.value) {
        const session = sessionResult.value;
        setSklandError(null);
        setSklandConfigured(session.configured);
        setSklandDisabledReason(session.disabledReason ?? null);
        setSklandAccounts(session.accounts);
        setSklandActiveAccountId(session.activeAccountId);
        setSklandStatusSnapshot(session.statusSnapshot ?? null);
        if (session.authenticated && session.scheduleSnapshot) {
          setSklandScheduleSnapshot(session.scheduleSnapshot);
          if (initialBoxSource.current === "skland" || !initialOperbox.current) {
            setOperbox(normalizeOperboxEntries(session.scheduleSnapshot.operbox));
            setFileName(session.scheduleSnapshot.sourceName);
            setBoxSource("skland");
          }
          if (
            !initialLayoutDirty.current
            && (initialBoxSource.current === "skland" || !initialOperbox.current)
            && session.scheduleSnapshot.infrastructure.layoutSuggestion
          ) {
            const suggestion = session.scheduleSnapshot.infrastructure.layoutSuggestion;
            setLayout(mergeSklandLayout(initialLayoutForRestore.current, suggestion));
            setLocalLayoutBackup(
              initialLayoutSource.current === "local"
                ? structuredClone(initialLayoutForRestore.current)
                : initialLocalLayoutBackup.current
            );
            setLayoutSource("skland");
            setPreset(resolvePreset(PRESETS.find((item) => item.label === session.scheduleSnapshot?.infrastructure.layoutLabel)));
          }
        }
      } else if (CLIENT_SKLAND_ENABLED && sessionResult.status === "rejected") {
        setSklandError(toDisplayError(sessionResult.reason, "森空岛会话恢复失败，请稍后刷新。"));
      }
      setSklandSessionLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredSession]);

  useEffect(() => {
    if (
      !CLIENT_SKLAND_ENABLED
      || page !== "skland"
      || !activeSklandAccount
      || sklandStatusSnapshot
      || statusLoadingAccount.current === activeSklandAccount.accountId
    ) return;
    let cancelled = false;
    statusLoadingAccount.current = activeSklandAccount.accountId;
    setSklandBusy(true);
    void getSklandStatus()
      .then((status) => {
        if (cancelled) return;
        setSklandAccounts(status.accounts);
        setSklandActiveAccountId(status.activeAccountId);
        setSklandStatusSnapshot(status.snapshot ?? null);
        setSklandError(null);
      })
      .catch((error) => {
        if (!cancelled) setSklandError(toDisplayError(error, "状态中心加载失败，请稍后重试。"));
      })
      .finally(() => {
        statusLoadingAccount.current = null;
        if (!cancelled) setSklandBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSklandAccount, page, sklandStatusReloadKey, sklandStatusSnapshot]);

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

  function applySklandSnapshot(snapshot: SklandScheduleSnapshot, applyLayoutWhenClean = true) {
    setSklandScheduleSnapshot(snapshot);
    setOperbox(normalizeOperboxEntries(snapshot.operbox));
    setFileName(snapshot.sourceName);
    setBoxSource("skland");
    setInputMode("skland");
    clearPlanResult();
    if (applyLayoutWhenClean && !layoutDirty && snapshot.infrastructure.layoutSuggestion) {
      if (layoutSource === "local") setLocalLayoutBackup(structuredClone(layout));
      setLayout((current) => mergeSklandLayout(current, snapshot.infrastructure.layoutSuggestion as BaseBlueprint));
      setLayoutSource("skland");
      setPreset(resolvePreset(PRESETS.find((item) => item.label === snapshot.infrastructure.layoutLabel)));
      setLayoutDirty(false);
    }
  }

  function applySklandSession(session: SklandSessionData, applyLayoutWhenClean = true) {
    setSklandAccounts(session.accounts);
    setSklandActiveAccountId(session.activeAccountId);
    setSklandStatusSnapshot(session.statusSnapshot ?? null);
    if (session.authenticated && session.scheduleSnapshot) {
      applySklandSnapshot(session.scheduleSnapshot, applyLayoutWhenClean);
      return;
    }
    setSklandScheduleSnapshot(null);
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
      if (!session.authenticated || !session.scheduleSnapshot) throw new Error("角色切换失败。");
      applySklandSession(session, false);
    } catch (error) {
      const normalized = toDisplayError(error, "角色切换失败，请稍后重试。");
      setSklandError(normalized);
      try {
        const current = await getSklandSession();
        setSklandAccounts(current.accounts);
        setSklandActiveAccountId(current.activeAccountId);
        setSklandStatusSnapshot(current.statusSnapshot ?? null);
        if (current.authenticated && current.scheduleSnapshot) applySklandSnapshot(current.scheduleSnapshot, false);
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
    const suggestion = sklandScheduleSnapshot?.infrastructure.layoutSuggestion;
    if (!suggestion) return;
    if (layoutSource === "local") setLocalLayoutBackup(structuredClone(layout));
    setLayout((current) => mergeSklandLayout(current, suggestion));
    setLayoutSource("skland");
    setPreset(resolvePreset(PRESETS.find((item) => item.label === sklandScheduleSnapshot.infrastructure.layoutLabel)));
    setLayoutDirty(false);
    clearPlanResult();
  }

  async function runPlanForLayout(planLayout: BaseBlueprint, retryUnavailable = false) {
    if (!operbox) return;
    const layoutError = layoutValidationError(planLayout);
    if (layoutError) {
      setApiError(displayError("AIC-LAYOUT-1201", layoutError));
      return;
    }
    if (!cliReady && !retryUnavailable) {
      setApiError(displayError("AIC-PLAN-3001", "排班服务暂不可用，请稍后重试。", true));
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    planAbortRef.current?.abort();
    planAbortRef.current = controller;
    setResultClearNotice(null);
    setInputError(null);
    setApiError(null);
    clearIssueState();

    try {
      const response = await runPlan({
        layout: planLayout,
        operbox: normalizeOperboxEntries(operbox),
        sourceName: fileName,
        boxSource,
        rotation: rotationProfile,
      }, controller.signal);
      setCliReady(true);
      setActiveShift(0);
      const responseTargets = await eligibleFiammettaTargetsFor(operbox, response.maa);
      const fiammettaError = validateFiammettaExport({
        settings: { enabled: fiammettaEnabled, target: fiammettaTarget, order: fiammettaOrder },
        ownsFiammetta,
        eligibleTargets: responseTargets,
      });
      setPreviousResult(result);
      const finalizedResult = {
        ...response,
        maa: applyFiammettaSettings(response.maa, {
          enabled: fiammettaEnabled && !fiammettaError,
          target: fiammettaTarget,
          order: fiammettaOrder,
        }),
      };
      setResult(finalizedResult);
      if (fiammettaError && fiammettaEnabled) {
        setApiError(displayError("AIC-BOX-1101", `${fiammettaError} 本次结果未写入菲亚梅塔换人。`));
      }
      setPlanHistory((current) => {
        const compact = { ...finalizedResult, debug: undefined };
        const next = [{ savedAt: new Date().toISOString(), result: compact }, ...current.filter((entry) => entry.result.diagnosticId !== response.diagnosticId)].slice(0, 5);
        try { writePlanHistory(window.localStorage, next); } catch { /* Keep history in memory when storage is full. */ }
        return next;
      });
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      setApiError(toDisplayError(error, "排班请求失败，请稍后重试。"));
    } finally {
      if (planAbortRef.current === controller) {
        planAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  function handleCancelRun() {
    planAbortRef.current?.abort();
    planAbortRef.current = null;
    setLoading(false);
  }

  function handleRestorePlan(entry: PlanHistoryEntry) {
    setPreviousResult(result);
    setResult(entry.result);
    setActiveShift(0);
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

  async function handleDownloadMaa() {
    if (!result?.maa || !operbox) return;
    const eligibleTargets = await eligibleFiammettaTargetsFor(operbox, result.maa);
    const validationError = validateFiammettaExport({
      settings: { enabled: fiammettaEnabled, target: fiammettaTarget, order: fiammettaOrder },
      ownsFiammetta,
      eligibleTargets,
    });
    if (validationError) {
      setApiError(displayError("AIC-BOX-1101", validationError));
      return;
    }
    downloadJson("arknights-infra-schedule-maa.json", result.maa);
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

    const environment = [
      `求解耗时：${Math.round(result.durationMs)} ms`,
      `班次：${activeShift + 1}`,
      `换班方式：${rotationProfile}`,
      `布局：${preset.label}`,
    ].join("；");
    const issue = { row: issueDraftRow, note: `${issueDraftNote.trim()}\n\n[运行环境] ${environment}` };

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

  function handleFiammettaEnabledChange(enabled: boolean) {
    setFiammettaEnabled(enabled);
    clearPlanResult();
  }

  function handleFiammettaTargetChange(target: string) {
    setFiammettaTarget(target);
    setFiammettaEnabled(true);
    clearPlanResult();
  }

  function handleFiammettaOrderChange(order: "pre" | "post") {
    setFiammettaOrder(order);
    clearPlanResult();
  }

  function applyPartialLocalLayoutEdit(patch: (layout: BaseBlueprint) => BaseBlueprint): BaseBlueprint {
    const next = applyLocalLayoutPatch({ layout, layoutSource, localLayoutBackup }, patch, defaultLayout);
    setLayout(next.layout);
    setLayoutSource(next.layoutSource);
    setLocalLayoutBackup(next.localLayoutBackup);
    setLayoutDirty(true);
    clearPlanResult();
    return next.layout;
  }

  function applyProductChange(change: ProductChange) {
    applyPartialLocalLayoutEdit((current) => layoutWithProductChange(current, change));
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
    const nextLayout = applyPartialLocalLayoutEdit(
      (current) => layoutWithProductChange(current, pendingProductChange)
    );
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
    setLayoutSource("local");
    setLocalLayoutBackup(null);
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
    applyPartialLocalLayoutEdit((current) => updateRoomLevel(current, roomId, level));
  }

  async function handleLayoutFile(file: File) {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()));
      if (!parsed) throw new Error("布局文件格式无效，请检查房间名称、类型和设施等级。");
      setLayout(parsed);
      setLayoutDirty(true);
      setLayoutSource("local");
      setLocalLayoutBackup(null);
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

  function useSklandSnapshotFromSetup() {
    if (sklandScheduleSnapshot) applySklandSnapshot(sklandScheduleSnapshot);
  }

  function handleSklandAuthenticated(session: SklandSessionData) {
    setSklandError(null);
    applySklandSession(session);
  }

  function handleRetrySklandStatus() {
    setSklandError(null);
    statusLoadingAccount.current = null;
    setSklandStatusReloadKey((current) => current + 1);
  }

  async function handleDeleteAllSklandData() {
    setSklandBusy(true);
    setSklandError(null);
    try {
      await deleteAllSklandData();
      const clearsBox = boxSource === "skland";
      const clearsLayout = layoutSource === "skland";
      const retainedLayout = clearsLayout
        ? localLayoutBackup ?? buildBlueprint(defaultPreset)
        : layout;
      const retainedPreset = clearsLayout
        ? resolvePreset(PRESETS.find((item) => item.label === retainedLayout.template))
        : preset;
      const retainedResult = clearsBox || clearsLayout ? null : result;
      try {
        persistSession(window.localStorage, {
          presetLabel: retainedPreset.label,
          layout: retainedLayout,
          operbox: clearsBox ? null : operbox,
          sourceName: clearsBox ? null : fileName,
          boxSource: clearsBox ? "sample" : boxSource,
          layoutDirty: clearsLayout ? false : layoutDirty,
          layoutSource: "local",
          localLayoutBackup: null,
          rotationProfile,
          result: retainedResult,
          activeShift: retainedResult ? activeShift : 0,
        });
      } catch {
        clearLocalProductData(window.localStorage);
        setStorageNotice(displayError(
          "AIC-LOCAL-7001",
          "浏览器无法保留独立导入数据，已改为清除整份本地会话以确保森空岛数据不再保留。"
        ));
      }
      setSklandAccounts([]);
      setSklandActiveAccountId(null);
      setSklandScheduleSnapshot(null);
      setSklandStatusSnapshot(null);
      if (clearsBox) {
        setOperbox(null);
        setFileName(null);
        setBoxSource("sample");
        setResult(null);
        setActiveShift(0);
      }
      if (clearsLayout) {
        setPreset(retainedPreset);
        setLayout(retainedLayout);
        setLayoutSource("local");
        setLocalLayoutBackup(null);
        setLayoutDirty(false);
        setResult(null);
        setActiveShift(0);
      }
      clearIssueState();
    } catch (error) {
      setSklandError(toDisplayError(error, "森空岛数据删除失败，请稍后重试。"));
      throw error;
    } finally {
      setSklandBusy(false);
    }
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
      setLayoutSource("local");
      setLocalLayoutBackup(null);
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
    if (apiError?.code === "AIC-PLAN-3001") {
      await runPlanForLayout(layout, true);
      return;
    }
    if (canRun) {
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
  const activity = usePlanActivity({ loading, result, error: statusError });

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
        <AppTopBar />
        <LiveActivity
          activity={activity}
          onRetry={() => void handleRetry()}
          onCopyDiagnostic={() => {
            if (activity?.error) void copyText(`${activity.error.code}${activity.error.requestId ? ` · ${activity.error.requestId}` : ""}`);
          }}
        />

      <div className="app-content-track py-4" data-app-content>
      {page === "calculator" ? (
        <InfraCalculator
          layout={layout}
          showBetaPanels={showBetaPanels}
          result={result}
          scheduleResult={scheduleResult}
          activeShift={activeShift}
          rows={rows}
          changedRoomIds={changedRoomIds}
          planHistory={planHistory}
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
          accountControl={CLIENT_SKLAND_ENABLED ? (
            <SklandAccountControl
              account={activeSklandAccount}
              statusSnapshot={sklandStatusSnapshot}
              sessionLoading={sklandSessionLoading}
              onOpenSkland={() => setPage("skland" as const)}
            />
          ) : undefined}
          onLoadSample={handleLoadSample}
          onOpenSetup={openSetup}
          onRun={handleRun}
          onCancelRun={handleCancelRun}
          onRestorePlan={handleRestorePlan}
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
      ) : CLIENT_SKLAND_ENABLED && page === "skland" ? (
        <SklandStatus
          scheduleSnapshot={sklandScheduleSnapshot}
          snapshot={sklandStatusSnapshot}
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
          onRetryStatus={handleRetrySklandStatus}
          onDeleteAllData={handleDeleteAllSklandData}
          onApplyLayout={handleApplySklandLayout}
          onContinueSetup={() => {
            setSetupInitialStep("layout");
            setSetupOpen(true);
          }}
          onOpenCalculator={() => setPage("calculator")}
          onCopyUid={(uid) => void copyText(uid)}
        />
      ) : page === "skill-query" ? (
        <SkillQuery />
      ) : (
        <TrainingAdvice operbox={operbox} layout={layout} profile={result?.profile} onOpenCalculator={() => setPage("calculator")} />
      )}
      </div>

      <footer className="app-content-track mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 py-5 text-xs text-muted-foreground">
        <span>非官方、小范围测试中的排班辅助工具</span>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">本站服务条款</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">本站隐私政策</Link>
        {debugToolsEnabled ? (
          <Link
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground"
            href={betaRequested ? "/" : "/?beta"}
            onClick={() => setBetaRequested((current) => !current)}
          >
            {betaRequested ? "退出调试工具" : "开启调试工具"}
          </Link>
        ) : null}
      </footer>

      {setupMounted ? <SetupDialog
        {...(CLIENT_SKLAND_ENABLED ? {
          sklandSnapshot: sklandScheduleSnapshot,
          sklandConfigured,
          sklandDisabledReason,
          onOpenSkland: openSklandFromSetup,
          onUseSklandSnapshot: useSklandSnapshotFromSetup,
        } : {})}
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
        onMaaFile={handleFile}
        onMaaPaste={handleMaaPaste}
        presets={PRESETS}
        preset={preset}
        layout={layout}
        configurationKey={setupConfigurationKey}
        rotationProfile={rotationProfile}
        onRotationProfileChange={handleRotationProfileChange}
        fiammettaEnabled={fiammettaEnabled}
        fiammettaTarget={fiammettaTarget}
        fiammettaOrder={fiammettaOrder}
        scheduledOperators={scheduledOperators}
        onFiammettaEnabledChange={handleFiammettaEnabledChange}
        onFiammettaTargetChange={handleFiammettaTargetChange}
        onFiammettaOrderChange={handleFiammettaOrderChange}
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
      /> : null}

      {issueModalMounted ? <IssueNoteModal
        open={issueOpen}
        row={issueDraftRow}
        note={issueDraftNote}
        saving={feedbackSaving}
        onNoteChange={setIssueDraftNote}
        onSave={handleSaveIssue}
        onCancel={handleCancelIssue}
      /> : null}
      {productModalMounted ? <ProductChangeConfirmModal
        open={Boolean(pendingProductChange)}
        roomLabel={rows.find((row) => row.roomId === pendingProductChange?.roomId)?.title ?? pendingProductChange?.roomId ?? "当前设施"}
        changeKind={pendingProductChange?.type === "trade" ? "贸易策略" : "制造配方"}
        nextValueLabel={pendingProductChange ? productChangeLabel(pendingProductChange) ?? "新配置" : "新配置"}
        busy={loading && Boolean(pendingProductChange)}
        onConfirm={() => void confirmScheduleProductChange()}
        onCancel={() => setPendingProductChange(null)}
      /> : null}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default WorkbenchApp;
