"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { CLIENT_SKLAND_ENABLED } from "@/client-features";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type AppPage } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { InfraCalculator } from "@/components/pages/InfraCalculator";
import { SkillLookup } from "@/components/pages/SkillLookup";
import { SklandStatus } from "@/components/pages/SklandStatus";
import { TrainingAdvice } from "@/components/pages/TrainingAdvice";

import {
  authorizeSklandStatus,
  deleteAllSklandData,
  getHealth,
  getSampleOperbox,
  getSklandSession,
  getSklandStatus,
  logoutSkland,
  runPlan,
  revokeSklandStatus,
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
  applyLocalLayoutPatch,
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
  SklandScheduleSnapshot,
  SklandStatusSnapshot,
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
  const [layoutSource, setLayoutSource] = useState<"local" | "skland">("local");
  const [localLayoutBackup, setLocalLayoutBackup] = useState<BaseBlueprint | null>(null);
  const [rotationProfile, setRotationProfile] = useState<RotationProfile>(DEFAULT_ROTATION_PROFILE);
  const [inputMode, setInputMode] = useState<"skland" | "maa">(CLIENT_SKLAND_ENABLED ? "skland" : "maa");
  const [maaPaste, setMaaPaste] = useState("");
  const [sklandScheduleSnapshot, setSklandScheduleSnapshot] = useState<SklandScheduleSnapshot | null>(null);
  const [sklandStatusSnapshot, setSklandStatusSnapshot] = useState<SklandStatusSnapshot | null>(null);
  const [sklandAccounts, setSklandAccounts] = useState<SklandAccountSummary[]>([]);
  const [sklandActiveAccountId, setSklandActiveAccountId] = useState<string | null>(null);
  const [sklandConfigured, setSklandConfigured] = useState(false);
  const [sklandDisabledReason, setSklandDisabledReason] = useState<string | null>(null);
  const [sklandSessionLoading, setSklandSessionLoading] = useState(CLIENT_SKLAND_ENABLED);
  const [sklandError, setSklandError] = useState<DisplayError | null>(null);
  const [sklandBusy, setSklandBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
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
        result,
        activeShift,
      });
      setStorageNotice(null);
    } catch {
      setStorageNotice(displayError("AIC-LOCAL-7001", "浏览器无法保存本地数据，但仍可继续生成排班。"));
    }
  }, [hasRestoredSession, preset, layout, operbox, fileName, boxSource, layoutDirty, layoutSource, localLayoutBackup, rotationProfile, result, activeShift]);

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
      || !activeSklandAccount?.statusAuthorized
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
  }, [activeSklandAccount, page, sklandStatusSnapshot]);

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
    setSklandStatusSnapshot(null);
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
      const selectedAccount = session.accounts.find((account) => account.accountId === session.activeAccountId);
      let status: Awaited<ReturnType<typeof getSklandStatus>> | null = null;
      let statusError: unknown = null;
      if (selectedAccount?.statusAuthorized) {
        try {
          status = await getSklandStatus();
        } catch (error) {
          statusError = error;
        }
      }
      applySklandSession(session, false);
      if (status) {
        setSklandAccounts(status.accounts);
        setSklandActiveAccountId(status.activeAccountId);
        setSklandStatusSnapshot(status.snapshot ?? null);
      } else if (statusError) {
        setSklandError(toDisplayError(statusError, "角色已切换，但状态中心加载失败，请稍后重试。"));
      }
    } catch (error) {
      const normalized = toDisplayError(error, "角色切换失败，请稍后重试。");
      setSklandError(normalized);
      try {
        const current = await getSklandSession();
        setSklandAccounts(current.accounts);
        setSklandActiveAccountId(current.activeAccountId);
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
        boxSource,
        rotation: rotationProfile,
      });
      setCliReady(true);
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

  async function handleAuthorizeSklandStatus() {
    setSklandBusy(true);
    setSklandError(null);
    try {
      const status = await authorizeSklandStatus();
      setSklandAccounts(status.accounts);
      setSklandActiveAccountId(status.activeAccountId);
      setSklandStatusSnapshot(status.snapshot ?? null);
    } catch (error) {
      setSklandError(toDisplayError(error, "无法启用状态中心，请稍后重试。"));
    } finally {
      setSklandBusy(false);
    }
  }

  async function handleRevokeSklandStatus() {
    setSklandBusy(true);
    setSklandError(null);
    try {
      const status = await revokeSklandStatus();
      setSklandAccounts(status.accounts);
      setSklandActiveAccountId(status.activeAccountId);
      setSklandStatusSnapshot(null);
    } catch (error) {
      setSklandError(toDisplayError(error, "无法撤回状态中心授权，请稍后重试。"));
    } finally {
      setSklandBusy(false);
    }
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
          {...(CLIENT_SKLAND_ENABLED ? {
            account: activeSklandAccount,
            statusSnapshot: sklandStatusSnapshot,
            sessionLoading: sklandSessionLoading,
            onOpenSkland: () => setPage("skland" as const),
          } : {})}
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
      ) : page === "skills" ? (
        <SkillLookup />
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
          onAuthorizeStatus={handleAuthorizeSklandStatus}
          onRevokeStatus={handleRevokeSklandStatus}
          onDeleteAllData={handleDeleteAllSklandData}
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

      <SetupDialog
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

