import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  FileWarning,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Smile,
  Upload,
} from "lucide-react";
import { CSSProperties, ChangeEvent, ReactNode, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import {
  FACTORY_RECIPE_OPTIONS,
  FactoryRecipe,
  TRADE_ORDER_OPTIONS,
  TradeOrder,
  factoryRecipeFor,
  maxRoomLevel,
  productLabel,
  roomKindLabel,
  tradeOrderFor,
} from "./blueprint";
import { CompactScheduleView } from "@/components/CompactScheduleView";
import { manufacturePoolReady, presentRoomEfficiency, profileEfficiency, RoomEfficiencyPresentation } from "./efficiency";
import { countElite2, countOwned, countSixStar } from "./operbox";
import {
  relativeMetricDelta,
  rotationMetricValue,
  shiftTabLabel,
  shiftTeamSummary,
  type RotationMetricKind,
} from "./rotation-presentation";
import { DEFAULT_ROTATION_PROFILE, rotationOption } from "./rotation-settings";
import { RoomRow } from "./schedule";
import {
  COMPACT_OPERATOR_SIZE_CLASS,
  LevelDiamondVariant,
  OPERATOR_NAME_SIZE_CLASS,
  levelDiamondCount,
  roomGridTone,
} from "./schedule-view-presentation";
import {
  buildListScheduleGroups,
  isListFunctionalFacilityRoom,
  listFunctionalFacilityGridClass,
  listFunctionalOperatorPosition,
  listFunctionalOperatorPlacementClass,
  listFunctionalRoomSpanClass,
  listMobileOperatorGridClass,
  listRoomHeightClass,
  listRoomTitleSizeClass,
  listRoomUsesAlignedOperatorOrigin,
} from "./schedule-list-layout";
import {
  BaseBlueprint,
  DisplayError,
  FeedbackData,
  IssueReport,
  MaaJson,
  MaaPlan,
  OperBoxEntry,
  PublicPlanData,
  PresetDef,
  RotationJson,
  UserProfile,
} from "./types";

type Option<T extends string> = {
  value: T;
  label: string;
};

export function ProductToggleGroup<T extends string>({
  value,
  options,
  onChange,
  columns,
  tone = "default",
  surface = "default",
  ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  columns: 2 | 3 | 4;
  tone?: "default" | "trade" | "factory";
  surface?: "default" | "room";
  ariaLabel: string;
}) {
  const compactRoomProductControls = surface === "room" && (tone === "trade" || tone === "factory");

  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      onValueChange={(nextValue) => {
        const next = nextValue[0] as T | undefined;
        if (next) onChange(next);
      }}
      spacing={1}
      className={cn(
        "grid",
        compactRoomProductControls
          ? "w-fit grid-cols-[repeat(2,70px)] gap-x-2 gap-y-2.5 sm:grid-cols-[repeat(2,90px)]"
          : cn(
              "w-full",
              columns === 4 ? "grid-cols-4 sm:grid-cols-2" : columns === 2 ? "grid-cols-2" : "grid-cols-3"
            )
      )}
    >
      {options.map((option) => {
        const isOriginiumTrade = tone === "trade" && option.value === "originium";
        const isOriginiumRecipe = tone === "factory" && option.value === "originium";
        const isBattleRecordRecipe = tone === "factory" && option.value === "battle_record";

        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            variant="outline"
            className={cn(
              "min-w-0 px-2 text-xs",
              surface === "room" && "infra-room-control",
              surface === "default" && "min-h-10",
              surface === "room" && "max-w-[90px] max-sm:max-w-[70px] border-white/20 bg-[#3C3C3C]/70 px-1.5 text-xs text-white hover:bg-[#4B4B4B] hover:text-white sm:px-2",
              tone === "trade" &&
                "aria-pressed:border-[#22BBFF] aria-pressed:bg-[#22BBFF] aria-pressed:text-[#313131] data-[state=on]:border-[#22BBFF] data-[state=on]:bg-[#22BBFF] data-[state=on]:text-[#313131]",
              isOriginiumTrade &&
                "aria-pressed:border-[#D84A4A] aria-pressed:bg-[#8F1E26] aria-pressed:text-white data-[state=on]:border-[#D84A4A] data-[state=on]:bg-[#8F1E26] data-[state=on]:text-white",
              tone === "factory" &&
                "aria-pressed:border-[#FFD800] aria-pressed:bg-[#FFD800] aria-pressed:text-[#313131] data-[state=on]:border-[#FFD800] data-[state=on]:bg-[#FFD800] data-[state=on]:text-[#313131]",
              isOriginiumRecipe &&
                "aria-pressed:border-[#D84A4A] aria-pressed:bg-[#8F1E26] aria-pressed:text-white data-[state=on]:border-[#D84A4A] data-[state=on]:bg-[#8F1E26] data-[state=on]:text-white",
              isBattleRecordRecipe &&
                "aria-pressed:border-[#4DB9FF] aria-pressed:bg-[#1F7DCE] aria-pressed:text-white data-[state=on]:border-[#4DB9FF] data-[state=on]:bg-[#1F7DCE] data-[state=on]:text-white"
            )}
          >
            {option.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function Panel({
  title,
  icon,
  children,
  className = "",
  action,
  description,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <section className={cn("min-w-0 py-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? <div className="mt-0.5 text-primary">{icon}</div> : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="min-w-0 max-sm:w-full">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function FileDrop({
  fileName,
  onFile,
}: {
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.currentTarget.value = "";
  }

  return (
    <Label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-4 py-5 text-center transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.96] hover:border-primary/40 hover:bg-muted/40 motion-reduce:transform-none">
      <Upload className="size-5 text-primary" />
      <span className="font-medium text-foreground">{fileName ?? "上传练度 JSON / XLSX"}</span>
      <span className="text-xs text-muted-foreground">
        支持 MAA 导出的干员数据 JSON，也支持一图流 XLSX
      </span>
      <input className="sr-only" type="file" accept=".json,.xlsx,.xls" onChange={handleChange} />
    </Label>
  );
}

export function PresetSelector({
  presets,
  selected,
  onSelect,
}: {
  presets: PresetDef[];
  selected: PresetDef;
  onSelect: (preset: PresetDef) => void;
}) {
  return (
    <ToggleGroup
      aria-label="布局预设"
      value={[selected.label]}
      onValueChange={(nextValue) => {
        const next = presets.find((preset) => preset.label === nextValue[0]);
        if (next) onSelect(next);
      }}
      spacing={2}
      className="grid w-full grid-cols-2 gap-2"
    >
      {presets.map((preset) => (
        <ToggleGroupItem
          key={preset.label}
          value={preset.label}
          variant="outline"
          className={cn(
            "interactive-surface-shadow h-auto min-h-18 justify-between rounded-lg border-0 bg-card px-3 py-3 text-left hover:bg-muted/55",
            selected.label === preset.label && "bg-muted text-foreground ring-2 ring-primary ring-offset-2 hover:bg-muted hover:text-foreground"
          )}
        >
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-lg font-semibold leading-none tabular-nums">{preset.label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {preset.trading} 贸 / {preset.manufacture} 制 / {preset.power} 电
            </span>
          </span>
          {selected.label === preset.label ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function RoomLevelControl({
  roomId,
  level,
  levelMax,
  onChange,
}: {
  roomId: string;
  level: number;
  levelMax: number;
  onChange: (level: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(level);

  const commit = (raw: string) => {
    const n = Number(raw.trim());
    const next = Number.isInteger(n) ? Math.max(1, Math.min(levelMax, n)) : level;
    if (next !== level) onChange(next);
    setDraft(null);
  };

  const levelOptions = Array.from({ length: levelMax }, (_, i) => String(i + 1));

  return (
    <>
      {/* PC：左右箭头 + 中间可输入 */}
      <div className="hidden h-10 w-20 items-center overflow-hidden rounded-lg border border-input sm:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${roomId} 等级减一`}
          className="h-full w-7 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={level <= 1}
          onClick={() => {
            setDraft(null);
            onChange(Math.max(1, level - 1));
          }}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Input
          type="text"
          inputMode="numeric"
          aria-label={`${roomId} 等级`}
          value={display}
          onFocus={() => setDraft(String(level))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="h-full w-12 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-center text-sm tabular-nums focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${roomId} 等级加一`}
          className="h-full w-7 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={level >= levelMax}
          onClick={() => {
            setDraft(null);
            onChange(Math.min(levelMax, level + 1));
          }}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      {/* 移动端：Combobox 选择 + 输入 */}
      <div className="sm:hidden">
        <Combobox
          items={levelOptions}
          value={String(level)}
          onValueChange={(value) => {
            const next = Number(value);
            if (Number.isInteger(next) && next >= 1 && next <= levelMax && next !== level) onChange(next);
          }}
          itemToStringValue={(item) => item}
        >
          <ComboboxInput
            aria-label={`${roomId} 等级`}
            className="w-20 [&_[data-slot=input-group-control]]:text-center"
            inputMode="numeric"
            pattern="[0-9]*"
            onBlur={(event) => {
              const raw = event.currentTarget.value;
              if (raw) {
                const n = Number(raw);
                const next = Number.isInteger(n) ? Math.max(1, Math.min(levelMax, n)) : level;
                if (next !== level) onChange(next);
              }
            }}
          />
          <ComboboxContent className="w-20 min-w-0" align="start">
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item} className="justify-center text-center">
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </>
  );
}

export function LayoutEditor({
  layout,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onRoomLevelChange,
}: {
  layout: BaseBlueprint;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onRoomLevelChange: (roomId: string, level: number) => void;
}) {
  const roomGroups = [
    { key: "function", label: "控制与功能区", rooms: layout.rooms.filter((room) => !["trade_post", "factory", "power_plant", "dormitory"].includes(room.kind)) },
    { key: "trade", label: "贸易站", rooms: layout.rooms.filter((room) => room.kind === "trade_post") },
    { key: "factory", label: "制造站", rooms: layout.rooms.filter((room) => room.kind === "factory") },
    { key: "power", label: "发电站", rooms: layout.rooms.filter((room) => room.kind === "power_plant") },
    { key: "dormitory", label: "宿舍", rooms: layout.rooms.filter((room) => room.kind === "dormitory") },
  ].filter((group) => group.rooms.length > 0);

  return (
    <div className="grid gap-5">
      {roomGroups.map((group) => (
        <section key={group.key} className="grid gap-2.5" aria-labelledby={`layout-group-${group.key}`}>
          <div className="flex items-center justify-between gap-3">
            <h4 id={`layout-group-${group.key}`} className="text-sm font-semibold text-balance">{group.label}</h4>
            <span className="text-xs tabular-nums text-muted-foreground">{group.rooms.length} 个设施</span>
          </div>
          <div className={cn("grid gap-2.5", !["trade", "factory"].includes(group.key) && "sm:grid-cols-2")}>
            {group.rooms.map((room) => {
          const isTrade = room.kind === "trade_post";
          const isFactory = room.kind === "factory";
          const activeOrder = isTrade ? tradeOrderFor(room) : null;
          const activeRecipe = isFactory ? factoryRecipeFor(room) : null;
          const product = productLabel(room);
          const levelMax = maxRoomLevel(room.kind);

          return (
            <div
              key={room.id}
              className={cn(
                "surface-shadow relative rounded-xl bg-card p-3 pl-4 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-transparent",
                isTrade && "before:bg-blue-500",
                isFactory && "before:bg-amber-400"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{roomKindLabel(room.kind)}</div>
                  <div className="truncate text-xs text-muted-foreground">{room.id}</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>等级</span>
                  <RoomLevelControl
                    roomId={room.id}
                    level={room.level}
                    levelMax={levelMax}
                    onChange={(level) => onRoomLevelChange(room.id, level)}
                  />
                </div>
              </div>

              {isTrade && activeOrder ? (
                <div className="mt-2">
                  <ProductToggleGroup
                    ariaLabel={`${room.id} 订单`}
                    value={activeOrder}
                    options={TRADE_ORDER_OPTIONS.map((option) => ({
                      value: option.order,
                      label: option.label,
                    }))}
                    columns={2}
                    tone="trade"
                    onChange={(order) => onTradeOrderChange(room.id, order)}
                  />
                </div>
              ) : isFactory && activeRecipe ? (
                <div className="mt-2">
                  <ProductToggleGroup
                    ariaLabel={`${room.id} 配方`}
                    value={activeRecipe}
                    options={FACTORY_RECIPE_OPTIONS.map((option) => ({
                      value: option.recipe,
                      label: option.label,
                    }))}
                    columns={2}
                    tone="factory"
                    onChange={(recipe) => onFactoryRecipeChange(room.id, recipe)}
                  />
                </div>
              ) : product ? (
                <div className="mt-2 text-xs text-muted-foreground">{product}</div>
              ) : null}
            </div>
          );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AccountStats({ operbox }: { operbox: OperBoxEntry[] | null }) {
  const stats = [
    ["拥有干员", countOwned(operbox)],
    ["精二干员", countElite2(operbox)],
    ["六星干员", countSixStar(operbox)],
  ] as const;

  return (
    <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10">
      {stats.map(([label, value]) => (
        <div key={label} className="px-3 py-3">
          <div className="text-xs text-white/58">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function StatusBar({
  loading,
  result,
  error,
  ready,
  onRetry,
  onCopyDiagnostic,
  className,
}: {
  loading: boolean;
  result: PublicPlanData | null;
  error: DisplayError | null;
  ready: boolean;
  onRetry: () => void;
  onCopyDiagnostic: () => void;
  className?: string;
}) {
  const content = (() => {
    if (loading) {
      return {
        icon: <Loader2 className="size-4 animate-spin" />,
        text: "正在生成排班",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    }
    if (error) {
      return {
        icon: <AlertTriangle className="size-4" />,
        text: `${error.message}（${error.code}）`,
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    }
    if (result) {
      return {
        icon: <CheckCircle2 className="size-4" />,
        text: "排班已生成",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    return {
      icon: <CircleHelp className="size-4" />,
      text: ready ? "排班服务已就绪" : "排班暂不可用",
      className: ready
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-border bg-background text-muted-foreground",
    };
  })();

  return (
    <div
      className={cn(
        "surface-shadow flex min-h-9 min-w-0 items-center gap-2 overflow-hidden rounded-lg px-3 py-1 text-sm max-sm:min-h-11 max-sm:px-2",
        content.className,
        className
      )}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      {content.icon}
      <span className="min-w-0 flex-1 truncate tabular-nums">{content.text}</span>
      {error ? (
        <span className="flex shrink-0 items-center gap-1">
          {error.retryable ? (
            <Button type="button" size="icon-sm" variant="ghost" className="max-sm:size-11" aria-label="重试" onClick={onRetry}>
              <RotateCcw />
            </Button>
          ) : null}
          <Button type="button" size="icon-sm" variant="ghost" className="max-sm:size-11" aria-label="复制诊断编号" onClick={onCopyDiagnostic}>
            <Copy />
          </Button>
        </span>
      ) : null}
    </div>
  );
}

export function RunButton({
  canRun,
  loading,
  onRun,
}: {
  canRun: boolean;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <Button
      className="h-9 min-w-0 px-3 max-sm:h-11 max-sm:px-3 max-sm:text-xs"
      aria-label={loading ? "计算中" : canRun ? "生成排班" : "请先导入干员数据"}
      title={!canRun ? "请先导入干员数据，并等待排班服务就绪。" : undefined}
      onClick={onRun}
      disabled={!canRun || loading}
    >
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      <span>{loading ? "计算中" : canRun ? "生成排班" : "导入后生成"}</span>
    </Button>
  );
}

export function ShiftTabs({
  maaJson,
  rotation,
  active,
  closest,
  onChange,
}: {
  maaJson?: MaaJson;
  rotation?: RotationJson;
  active: number;
  closest?: number;
  onChange: (index: number) => void;
}) {
  const plans = maaJson?.plans ?? [];

  if (plans.length === 0) {
    return (
      <Button type="button" variant="outline" disabled size="sm">
        等待结果
      </Button>
    );
  }

  return (
    <Tabs value={String(active)} onValueChange={(value) => onChange(Number(value))} className="max-w-full">
      <TabsList
        className="font-technical max-w-full justify-start overflow-x-auto overflow-y-hidden tracking-[0.01em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-shift-tabs
      >
        {plans.map((plan, index) => {
          const shift = rotation?.shifts[index];
          const label = shiftTabLabel(shift, index);
          const teamSummary = shiftTeamSummary(shift, rotation?.profile ?? DEFAULT_ROTATION_PROFILE);
          return (
            <TabsTrigger
              key={`${plan.name}-${index}`}
              value={String(index)}
              aria-label={teamSummary ? `${label}，${teamSummary}` : label}
            >
              {label}
              {closest === index ? <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">最接近</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function compactNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, "");
}

function profileSeverityClass(severity: "ok" | "warn" | "critical") {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function PlanTelemetry({
  profile,
  rotation,
  layout,
  activeShift,
}: {
  profile?: UserProfile;
  rotation?: RotationJson;
  layout: BaseBlueprint;
  activeShift: number;
}) {
  if (!profile && !rotation) return null;

  const active = rotation?.shifts?.[activeShift];
  const rotationProfile = rotation?.profile ?? profile?.rotation_profile ?? DEFAULT_ROTATION_PROFILE;
  const selectedRotation = rotationOption(rotationProfile);
  const activeTeamSummary = shiftTeamSummary(active, rotationProfile);
  const summary = profile?.summary;
  const manufactureReady = summary ? manufacturePoolReady(summary) : undefined;
  const currentProfileRotation = profile?.rotation;
  const baselineProfileRotation = profile?.baseline_rotation;
  const dailyMetrics = [
    {
      kind: "trade" as const,
      label: "24h 贸易",
      value: rotation?.daily.trade ?? currentProfileRotation?.daily_trade_efficiency ?? currentProfileRotation?.daily_trade,
      baseline: baselineProfileRotation?.daily_trade_efficiency ?? baselineProfileRotation?.daily_trade,
      suffix: "×",
    },
    {
      kind: "manu" as const,
      label: "24h 制造",
      value: rotation?.daily.manu ?? currentProfileRotation?.daily_manufacture_efficiency ?? currentProfileRotation?.daily_manu,
      baseline: baselineProfileRotation?.daily_manufacture_efficiency ?? baselineProfileRotation?.daily_manu,
      suffix: "%",
    },
    {
      kind: "power" as const,
      label: "24h 发电",
      value: rotation?.daily.power ?? currentProfileRotation?.daily_power_efficiency ?? currentProfileRotation?.daily_power,
      baseline: baselineProfileRotation?.daily_power_efficiency ?? baselineProfileRotation?.daily_power,
      suffix: "%",
    },
  ].filter((metric): metric is {
    kind: RotationMetricKind;
    label: string;
    value: number;
    baseline: number | undefined;
    suffix: string;
  } => typeof metric.value === "number");
  const domains = profile?.domains ?? [];

  return (
    <section className="mb-4 overflow-hidden border-y border-[#313131]/15 bg-[#F3F1EA]" aria-label="效率概览">
      <div className="grid grid-cols-[auto_1fr] items-stretch max-md:grid-cols-1">
        <div className="flex min-w-36 flex-col justify-center bg-[#313131] px-4 py-3 text-white">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">效率概览</span>
          <strong className="mt-0.5 text-xl font-medium">当前方案</strong>
          <span className="mt-1 text-xs text-white/62">
            {layout.template} · {layout.rooms.length} 个设施
          </span>
          <span className="mt-0.5 text-xs text-white/62">
            {selectedRotation.label} · {rotation?.shifts.length ?? 0} 班
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] divide-x divide-[#313131]/10 max-sm:divide-x-0 max-sm:grid-cols-2">
          {dailyMetrics.map((metric) => {
            const value = rotationMetricValue(metric.kind, metric.value);
            const displayDigits = metric.kind === "trade" ? 3 : 1;
            const baseline = typeof metric.baseline === "number"
              ? rotationMetricValue(metric.kind, metric.baseline)
              : undefined;
            const delta = typeof metric.baseline === "number"
              ? relativeMetricDelta(metric.value, metric.baseline)
              : undefined;
            return (
              <div key={metric.label} className="px-4 py-3">
                <span className="block text-xs text-[#313131]/58">{metric.label}</span>
                <strong className="font-technical mt-0.5 block text-lg font-semibold tabular-nums tracking-[0.01em] text-[#313131]">
                  {compactNumber(value, displayDigits)}{metric.suffix}
                </strong>
                <span className="mt-0.5 block whitespace-nowrap text-[10px] tabular-nums text-[#313131]/52">
                  参考 {baseline === undefined ? "—" : `${compactNumber(baseline, displayDigits)}${metric.suffix}`}
                  {delta === undefined ? null : (
                    <span className={cn("ml-1", delta >= 0 ? "text-emerald-700" : "text-red-700")}>
                      · {delta >= 0 ? "+" : ""}{compactNumber(delta)}%
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          {active ? (
            <div className="px-4 py-3">
              <span className="block text-xs text-[#313131]/58">当前班次</span>
              <strong className="font-technical mt-0.5 block text-lg font-semibold tabular-nums tracking-[0.01em] text-[#313131]">
                {compactNumber(active.duration_hours)}h
              </strong>
              {activeTeamSummary ? (
                <span className="mt-0.5 block whitespace-nowrap text-[10px] text-[#313131]/52">{activeTeamSummary}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[#313131]/10 px-4 py-2 text-xs text-[#313131]/68">
          <span>已拥有 <strong className="font-technical text-[#313131]">{summary.owned}</strong></span>
          <span>进阶可用 <strong className="font-technical text-[#313131]">{summary.tier_up_owned}</strong></span>
          <span>贸易候选 <strong className="font-technical text-[#313131]">{summary.trade_pool_ready}</strong></span>
          {manufactureReady !== undefined ? <span>制造候选 <strong className="font-technical text-[#313131]">{manufactureReady}</strong></span> : null}
          <span>中枢等级 <strong className="font-technical text-[#313131]">Lv.{layout.rooms.find((room) => room.kind === "control_center")?.level ?? "—"}</strong></span>
        </div>
      ) : null}

      {domains.length > 0 || profile?.actions.length || profile?.flags.length || profile?.narration_hints.length ? (
        <details className="group border-t border-[#313131]/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium text-[#313131] marker:content-none">
            <span>效率详情 · {domains.length} 个指标</span>
            <span className="text-[#313131]/50 group-open:hidden">展开</span>
            <span className="hidden text-[#313131]/50 group-open:inline">收起</span>
          </summary>
          <div className="border-t border-[#313131]/10 bg-white/55 px-4 py-3">
            {domains.length > 0 ? (
              <div className="grid gap-1.5">
                {domains.map((domain) => {
                  const current = profileEfficiency(domain.current);
                  const baseline = profileEfficiency(domain.baseline);
                  return (
                    <div key={domain.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-[#313131]/8 py-1.5 text-xs last:border-0 max-sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <strong className="block truncate font-medium text-[#313131]">{domain.label}</strong>
                        {domain.current.operators.length ? <span className="block truncate text-xs text-[#313131]/52">{domain.current.operators.join(" / ")}</span> : null}
                        {domain.current.mechanic_equivalent_efficiency !== undefined
                          || domain.baseline.mechanic_equivalent_efficiency !== undefined ? (
                            <span className="mt-0.5 block truncate text-[10px] tabular-nums text-[#313131]/48">
                              机制等效 当前 {domain.current.mechanic_equivalent_efficiency === undefined
                                ? "—"
                                : compactNumber(domain.current.mechanic_equivalent_efficiency, 3)}
                              {" · "}参考 {domain.baseline.mechanic_equivalent_efficiency === undefined
                                ? "—"
                                : compactNumber(domain.baseline.mechanic_equivalent_efficiency, 3)}
                            </span>
                          ) : null}
                      </div>
                      <span className="tabular-nums text-[#313131]">当前 {current === undefined ? "—" : compactNumber(current, 2)}</span>
                      <span className="tabular-nums text-[#313131]/55 max-sm:hidden">基准 {baseline === undefined ? "—" : compactNumber(baseline, 2)}</span>
                      <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-semibold", profileSeverityClass(domain.severity))}>
                        {domain.gap_ratio >= 0 ? "+" : ""}{compactNumber(domain.gap_ratio * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {profile?.actions.length ? (
              <ul className="mt-3 grid gap-1 border-t border-[#313131]/10 pt-3 text-xs text-[#313131]/70">
                {profile.actions.map((action, index) => <li key={`${action.domain_id}-${action.operator}-${index}`}><strong className="text-[#313131]">{action.priority}</strong> · {action.message}</li>)}
              </ul>
            ) : null}
            {profile?.flags.length || profile?.narration_hints.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#313131]/10 pt-3">
                {[...(profile?.flags ?? []), ...(profile?.narration_hints ?? [])].map((flag) => <span key={flag} className="bg-[#313131]/7 px-1.5 py-0.5 text-xs text-[#313131]/65">{flag}</span>)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

type RoomVisual = {
  accent: string;
  level: string;
  background: string;
};

const ROOM_SLOT_COUNT = 5;
const AUXILIARY_ROOM_GROUPS = new Set(["dormitory", "hire", "meeting", "processing"]);

function roomSlotCountFor(group: string) {
  if (group === "trading" || group === "manufacture") return 3;
  return ROOM_SLOT_COUNT;
}

const ROOM_VISUALS: Record<string, RoomVisual> = {
  trading: {
    accent: "#22BBFF",
    level: "#22BBFF",
    background: "/images/building-room-emblems/emblem_trading.png",
  },
  manufacture: {
    accent: "#FFD800",
    level: "#FFD800",
    background: "/images/building-room-emblems/emblem_manufacture.png",
  },
  power: {
    accent: "#B8F03A",
    level: "#B8F03A",
    background: "/images/building-room-emblems/emblem_power.png",
  },
  control: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_control.png",
  },
  dormitory: {
    accent: "#016E65",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_dormitory.png",
  },
  meeting: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_meeting.png",
  },
  processing: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_workshop.png",
  },
  hire: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_hire.png",
  },
  training: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_training.png",
  },
  default: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-emblems/emblem_none.png",
  },
};

export function roomVisualFor(group: string): RoomVisual {
  return ROOM_VISUALS[group] ?? ROOM_VISUALS.default;
}

export function LevelDiamonds({
  level,
  maxLevel,
  variant = "list",
}: {
  level?: number;
  maxLevel?: number;
  variant?: LevelDiamondVariant;
}) {
  const count = levelDiamondCount(level);
  if (!count || !level) return null;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      aria-label={`${level} 级，最高 ${maxLevel ?? level} 级`}
      title={variant === "compact" ? `Lv.${level}/${maxLevel ?? level}` : undefined}
    >
      <span className="level-diamonds" data-variant={variant} aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <span key={index} className="level-diamond" />
        ))}
      </span>
      {variant === "list" ? (
        <span className="font-technical shrink-0 text-xs font-semibold tracking-[0.02em] text-white/68">
          Lv.{level}/{maxLevel ?? level}
        </span>
      ) : null}
    </span>
  );
}

export function RoomEfficiencyReadout({ value, details = true }: { value: RoomEfficiencyPresentation; details?: boolean }) {
  return (
    <div className="min-w-0" title={value.details.map((detail) => `${detail.label} ${detail.value}`).join(" · ")}>
      <div className="flex min-w-0 items-center gap-1.5">
        <strong className="infra-room-value font-technical shrink-0 text-base font-semibold tabular-nums tracking-[0.01em] text-[var(--room-accent)] max-sm:text-xs">{value.primaryValue}</strong>
        <span className="truncate text-xs font-medium text-white/68">{value.primaryLabel}</span>
        {value.includesCrossStation ? <span className="shrink-0 bg-white/12 px-1 text-xs font-normal text-white/82">含跨设施</span> : null}
      </div>
      {details && value.details.length ? (
        <div className="font-technical mt-1 flex max-h-9 flex-wrap gap-x-2 gap-y-0.5 overflow-hidden text-xs leading-4 tracking-[0.01em] text-white/60 max-sm:max-h-none">
          {value.details.map((detail) => (
            <span key={`${detail.label}-${detail.value}`} className={detail.kind === "cross-station" ? "font-semibold text-[#C8F75A]" : undefined}>
              {detail.label} {detail.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomEfficiencyDetails({
  value,
  compactFactory = false,
}: {
  value: RoomEfficiencyPresentation | null;
  compactFactory?: boolean;
}) {
  if (!value?.details.length) return null;

  return (
    <div
      className={cn(
        "font-technical ml-6 grid min-w-[160px] max-w-[240px] gap-1 text-sm leading-tight tracking-[0.01em] text-white/68 max-sm:hidden max-[819px]:ml-0 max-[819px]:min-w-0 max-[819px]:max-w-none max-[819px]:grid-cols-3 max-[819px]:text-xs max-[819px]:leading-normal",
        compactFactory && "min-[1800px]:z-10 min-[1800px]:col-start-1 min-[1800px]:row-start-2 min-[1800px]:ml-0 min-[1800px]:flex min-[1800px]:min-w-0 min-[1800px]:max-w-none min-[1800px]:gap-3 min-[1800px]:text-xs"
      )}
      title={value.details.map((detail) => `${detail.label} ${detail.value}`).join(" · ")}
    >
      {value.details.map((detail) => (
        <span
          key={`${detail.label}-${detail.value}`}
          className={cn(
            "whitespace-nowrap",
            detail.kind === "cross-station" && "font-semibold text-[#C8F75A]"
          )}
        >
          {detail.label} {detail.value}
        </span>
      ))}
    </div>
  );
}

export function RoomProductControls({
  row,
  layoutRoom,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  row: RoomRow;
  layoutRoom: BaseBlueprint["rooms"][number] | undefined;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  const isTrade = layoutRoom?.kind === "trade_post";
  const isFactory = layoutRoom?.kind === "factory";
  const activeOrder = isTrade ? tradeOrderFor(layoutRoom) : null;
  const activeRecipe = isFactory ? factoryRecipeFor(layoutRoom) : null;

  if (isTrade && activeOrder) {
    return (
      <div className="w-full max-sm:w-fit">
        <ProductToggleGroup
          ariaLabel={`${row.title} 订单`}
          value={activeOrder}
          options={TRADE_ORDER_OPTIONS.map((option) => ({
            value: option.order,
            label: option.label,
          }))}
          columns={2}
          tone="trade"
          surface="room"
          onChange={(order) => onTradeOrderChange(row.roomId, order)}
        />
      </div>
    );
  }

  if (isFactory && activeRecipe) {
    return (
      <div className="w-full max-w-[220px]">
        <ProductToggleGroup
          ariaLabel={`${row.title} 配方`}
          value={activeRecipe}
          options={FACTORY_RECIPE_OPTIONS.map((option) => ({
            value: option.recipe,
            label: option.label,
          }))}
          columns={4}
          tone="factory"
          surface="room"
          onChange={(recipe) => onFactoryRecipeChange(row.roomId, recipe)}
        />
      </div>
    );
  }

  if (!row.product) return null;

  return <div className="infra-room-value text-lg font-medium leading-none text-[var(--room-accent)]">{row.product}</div>;
}

function OperatorSlotShell({
  ariaLabel,
  centerFrameInList,
  compactFactory,
  compactView,
  frameClassName,
  frameContent,
  label,
  labelClassName,
  title,
}: {
  ariaLabel?: string;
  centerFrameInList: boolean;
  compactFactory: boolean;
  compactView: boolean;
  frameClassName: string;
  frameContent?: ReactNode;
  label: string;
  labelClassName: string;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "infra-operator-slot min-w-0 shrink-0",
        compactView
          ? COMPACT_OPERATOR_SIZE_CLASS
          : "[--operator-slot-size:clamp(70px,7.3vw,88px)] max-sm:[--operator-slot-size:clamp(56px,16vw,76px)]",
        compactFactory && "min-[1800px]:[--operator-slot-size:70px]",
        centerFrameInList && "max-sm:w-full sm:relative sm:h-full sm:w-[var(--operator-slot-size)]",
      )}
      title={title}
    >
      <div
        className={cn(
          "relative aspect-square h-[var(--operator-slot-size)] min-w-0 shrink-0 overflow-hidden border-2 max-sm:border",
          frameClassName,
          centerFrameInList && "max-sm:h-auto max-sm:w-full sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2",
        )}
        aria-label={ariaLabel}
      >
        {frameContent}
      </div>
      <span
        className={cn(
          "mt-0.5 block truncate text-center leading-tight",
          OPERATOR_NAME_SIZE_CLASS,
          labelClassName,
          centerFrameInList && "sm:absolute sm:left-0 sm:top-[calc(50%+var(--operator-slot-size)/2+2px)] sm:mt-0 sm:w-full",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function OperatorSlot({
  slot,
  currentMorale,
  autofill = false,
  compactFactory = false,
  compactView = false,
  centerFrameInList = false,
}: {
  slot: RoomRow["operatorSlots"][number] | undefined;
  currentMorale?: number;
  autofill?: boolean;
  compactFactory?: boolean;
  compactView?: boolean;
  centerFrameInList?: boolean;
}) {
  if (!slot) {
    if (autofill) {
      return (
        <OperatorSlotShell
          ariaLabel="自动补位"
          centerFrameInList={centerFrameInList}
          compactFactory={compactFactory}
          compactView={compactView}
          frameClassName="border-[#666] bg-[#3C3C3C] shadow-[inset_0_0_18px_rgba(255,255,255,0.08)]"
          frameContent={
            <span className="flex h-full items-center justify-center text-xs font-semibold tracking-[0.14em] text-white/55">
              AUTO
            </span>
          }
          label="自动补位"
          labelClassName="text-white/55"
        />
      );
    }

    return (
      <OperatorSlotShell
        ariaLabel="空置"
        centerFrameInList={centerFrameInList}
        compactFactory={compactFactory}
        compactView={compactView}
        frameClassName="border-[#4B4B4B] bg-[#3C3C3C] after:absolute after:left-1/2 after:top-1/2 after:h-0.5 after:w-[78%] after:origin-center after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-[-45deg] after:bg-[#4B4B4B] after:content-['']"
        label="占"
        labelClassName="text-transparent select-none"
      />
    );
  }

  return (
    <OperatorSlotShell
      centerFrameInList={centerFrameInList}
      compactFactory={compactFactory}
      compactView={compactView}
      frameClassName="border-[#7F7F7F] bg-[#3C3C3C] shadow-[inset_0_0_18px_rgba(255,255,255,0.16)]"
      frameContent={
        <>
          {slot.portrait ? (
            <img src={slot.portrait} alt={slot.name} className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#4B4B4B] px-2 text-center text-xs font-semibold text-white">
              {slot.name}
            </div>
          )}
          {typeof currentMorale === "number" ? (
          <span
            className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 whitespace-nowrap rounded-sm bg-black/72 px-1 py-0.5 text-xs font-normal leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.5)] [&_svg]:size-2.5 max-sm:bottom-0.5 max-sm:left-0.5 max-sm:px-0.5 max-sm:[&_svg]:size-2.5"
            aria-label={`当前心情 ${currentMorale}/24`}
            title={`当前心情 ${currentMorale}/24`}
          >
            <Smile className="text-[#FFD501]" />
            <span className="max-sm:hidden">当前</span>
            <span>{currentMorale}</span>
          </span>
          ) : null}
        </>
      }
      label={slot.name}
      labelClassName="text-white"
      title={slot.label}
    />
  );
}

export function ScheduleBoard({
  rows,
  layout,
  currentMoraleByOperator,
  shiftInfoSlot,
  activeShift,
  activePlan,
  onIssue,
  onFactoryRecipeChange,
  onTradeOrderChange,
  onViewModeChange,
}: {
  rows: RoomRow[];
  layout: BaseBlueprint;
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  shiftInfoSlot?: ReactNode;
  activeShift: number;
  activePlan?: MaaPlan;
  onIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onViewModeChange?: (viewMode: "list" | "compact") => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [hiddenGroups, setHiddenGroups] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"list" | "compact">("list");
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (!e.matches) {
        setViewMode("list");
        onViewModeChange?.("list");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [onViewModeChange]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        没有可展示的布局房间。
      </div>
    );
  }

  const rowGroups = buildListScheduleGroups(rows);
  const auxiliaryGroups = rowGroups.filter((group) => AUXILIARY_ROOM_GROUPS.has(group.rows[0]?.group ?? ""));
  const hiddenAuxiliaryCount = auxiliaryGroups.filter((group) => hiddenGroups[group.label]).length;
  const allAuxiliaryCollapsed =
    auxiliaryGroups.length > 0 &&
    auxiliaryGroups.every((group) => collapsedGroups[group.label] || hiddenGroups[group.label]);

  function toggleAuxiliaryGroups() {
    if (allAuxiliaryCollapsed) {
      setCollapsedGroups((current) => {
        const next = { ...current };
        auxiliaryGroups.forEach((group) => {
          next[group.label] = false;
        });
        return next;
      });
      setHiddenGroups((current) => {
        const next = { ...current };
        auxiliaryGroups.forEach((group) => {
          next[group.label] = false;
        });
        return next;
      });
      return;
    }

    setCollapsedGroups((current) => {
      const next = { ...current };
      auxiliaryGroups.forEach((group) => {
        next[group.label] = true;
      });
      return next;
    });
  }

  function restoreHiddenAuxiliaryGroups() {
    setHiddenGroups((current) => {
      const next = { ...current };
      auxiliaryGroups.forEach((group) => {
        next[group.label] = false;
      });
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {shiftInfoSlot ? (
        <div className="flex items-start justify-between gap-3 max-sm:flex-col">{shiftInfoSlot}</div>
      ) : null}
      <Tabs
        value={viewMode}
        onValueChange={(value) => {
          const nextViewMode = value as "list" | "compact";
          setViewMode(nextViewMode);
          onViewModeChange?.(nextViewMode);
        }}
      >
        <TabsList>
          <TabsTrigger value="list">列表式布局</TabsTrigger>
          <TabsTrigger value="compact" disabled={!isDesktop} className={!isDesktop ? "line-through" : ""}>
            一图流布局
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {viewMode === "list" ? (
        <>
          {auxiliaryGroups.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {hiddenAuxiliaryCount ? (
                <Button type="button" variant="ghost" size="sm" onClick={restoreHiddenAuxiliaryGroups}>
                  恢复已隐藏（{hiddenAuxiliaryCount}）
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={toggleAuxiliaryGroups}>
                <ChevronDown className={cn("transition-transform", allAuxiliaryCollapsed ? "-rotate-90" : "rotate-0")} />
                {allAuxiliaryCollapsed ? "展开辅助设施" : "一键折叠辅助设施"}
              </Button>
            </div>
          ) : null}
          {rowGroups.map((group) => {
        const visual = roomVisualFor(group.rows[0]?.group ?? "default");
        const groupStyle = {
          "--room-accent": visual.accent,
        } as CSSProperties;
        const collapsed = collapsedGroups[group.label];
        const auxiliary = AUXILIARY_ROOM_GROUPS.has(group.rows[0]?.group ?? "");
        if (hiddenGroups[group.label]) return null;

        return (
          <section key={group.label} className="min-w-0" aria-label={group.label} style={groupStyle}>
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2.5 text-left max-sm:min-h-11"
                aria-expanded={!collapsed}
                onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
              >
                <span className="infra-room-accent h-7 w-1.5 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
                <h3 className="truncate text-[21px] font-medium leading-none text-[#313131]">{group.label}</h3>
                <span className="font-technical text-xs text-[#313131]/56">{group.rows.length}</span>
                <ChevronDown className={cn("size-4 shrink-0 text-[#313131]/45 transition-transform", collapsed && "-rotate-90")} />
              </button>
              {auxiliary && collapsed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setHiddenGroups((current) => ({ ...current, [group.label]: true }))}
                >
                  暂不显示
                </Button>
              ) : null}
            </div>
            <div
              className={cn(
                "grid min-w-0 gap-3 pb-2 max-sm:gap-4 max-sm:pb-4",
                group.label === "功能设施" && listFunctionalFacilityGridClass(),
                group.rows[0]?.group === "manufacture" && "min-[1800px]:grid-cols-2",
                collapsed && "hidden"
              )}
            >
              {group.rows.map((row) => {
                const layoutRoom = layout.rooms.find((room) => room.id === row.roomId);
                const rowVisual = roomVisualFor(row.group);
                const efficiency = presentRoomEfficiency(row.group, row.efficiency);
                const compactInlineRoom = isListFunctionalFacilityRoom(row.group);
                const narrowLeftPanel = listRoomUsesAlignedOperatorOrigin(row.group);
                const compactFactoryRoom = row.group === "manufacture";
                const functionalOperatorPosition = listFunctionalOperatorPosition(row.group);
                const functionalOperatorPlacementClass = listFunctionalOperatorPlacementClass(row.group);
                const slotCount = compactInlineRoom ? (row.group === "meeting" ? 2 : 1) : roomSlotCountFor(row.group);
                const slots = Array.from({ length: slotCount }, (_, index) => row.operatorSlots[index]);
                const gridTone = roomGridTone(row.group);
                const rowStyle = {
                  "--room-accent": rowVisual.accent,
                  "--room-level": rowVisual.level,
                  "--room-grid-color": gridTone.color,
                  "--room-grid-opacity": gridTone.opacity,
                  "--room-grid-fade-start": gridTone.fadeStart,
                } as CSSProperties;

                return (
                  <div
                    key={row.key}
                    className={cn(
                      "infra-room-surface relative flex w-full overflow-hidden text-white max-[819px]:h-auto max-[819px]:flex-col",
                      listRoomHeightClass(row.group),
                      compactInlineRoom && "[container-type:inline-size]",
                      listFunctionalRoomSpanClass(row.group),
                      row.suspicious && "ring-2 ring-destructive ring-offset-2"
                    )}
                    data-room-group={row.group}
                    data-room-title={row.title}
                    style={rowStyle}
                  >
                    <div className={cn("relative w-[220px] shrink-0 overflow-hidden", compactInlineRoom && "w-[210px]", narrowLeftPanel && "w-[240px]", row.group === "meeting" && "w-[360px]", "max-[819px]:w-full")}>
                      <div
                        className="infra-room-emblem absolute inset-0 bg-left bg-no-repeat"
                        style={{
                          backgroundImage: `url(${rowVisual.background})`,
                          backgroundPosition: "-18px center",
                          backgroundSize: "auto 100%",
                        }}
                        aria-hidden="true"
                      />
                      <div className="relative z-10 flex h-full flex-col justify-center gap-2 px-3 py-3 max-sm:justify-start max-sm:gap-2 max-sm:px-3 max-sm:py-3">
                        <div className="max-sm:flex max-sm:items-center max-sm:gap-2">
                          <div>
                            <div className="flex items-center gap-2.5 max-sm:gap-1.5">
                              <div className={cn("min-w-0 truncate font-medium tracking-[-0.02em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.75)]", listRoomTitleSizeClass())}>
                                {row.title}
                              </div>
                              <LevelDiamonds level={row.level} maxLevel={layoutRoom ? maxRoomLevel(layoutRoom.kind) : row.level} />
                            </div>
                          </div>
                          {efficiency ? (
                            <div className="hidden max-sm:block shrink-0">
                              <RoomEfficiencyReadout value={efficiency} details={false} />
                            </div>
                          ) : null}
                        </div>
                        {efficiency ? (
                          <div className="max-sm:hidden">
                            <RoomEfficiencyReadout value={efficiency} details={false} />
                          </div>
                        ) : null}
                        <RoomProductControls
                          row={row}
                          layoutRoom={layoutRoom}
                          onFactoryRecipeChange={onFactoryRecipeChange}
                          onTradeOrderChange={onTradeOrderChange}
                        />
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-5 py-2 pl-2 pr-3 min-[820px]:h-full max-[819px]:flex-col max-[819px]:items-stretch max-[819px]:gap-3 max-[819px]:px-3 max-[819px]:pb-4 max-[819px]:pt-1",
                        compactInlineRoom && "justify-center pl-4 pr-8",
                        compactFactoryRoom && "min-[1800px]:grid min-[1800px]:grid-cols-1 min-[1800px]:grid-rows-[1fr_auto] min-[1800px]:items-stretch min-[1800px]:gap-1 min-[1800px]:pr-3"
                      )}
                    >
                      <div
                        className={cn(
                          "infra-list-operator-grid grid min-w-0 items-center justify-start [column-gap:var(--operator-column-gap-desktop)] min-[820px]:h-full",
                          listMobileOperatorGridClass(),
                          compactInlineRoom ? "min-[820px]:flex-none" : "min-[820px]:flex-1 min-[820px]:grid-flow-col min-[820px]:auto-cols-max",
                          compactFactoryRoom && "min-[1800px]:col-start-1 min-[1800px]:row-span-2 min-[1800px]:row-start-1",
                          compactInlineRoom && (slotCount === 2 ? "grid-cols-2" : "grid-cols-1"),
                          functionalOperatorPlacementClass
                        )}
                        style={{
                          "--operator-column-gap-desktop": functionalOperatorPosition?.columnGap
                            ?? "clamp(0.75rem, 1.25vw, 1.25rem)",
                          ...(functionalOperatorPosition
                            ? { left: functionalOperatorPosition.left }
                            : {}),
                        } as CSSProperties}
                      >
                        {slots.map((slot, index) => (
                          <OperatorSlot
                            key={`${slot?.name ?? "empty"}-${index}`}
                            slot={slot}
                            currentMorale={slot ? currentMoraleByOperator?.get(slot.name) : undefined}
                            autofill={row.group === "dormitory" && row.autofill}
                            compactFactory={compactFactoryRoom}
                            centerFrameInList
                          />
                        ))}
                      </div>
                      {compactInlineRoom ? null : (
                        <RoomEfficiencyDetails value={efficiency} compactFactory={compactFactoryRoom} />
                      )}
                    </div>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-2 top-2 z-10 border border-white/10 bg-[#3C3C3C]/55 text-white/70 hover:bg-[#4B4B4B] hover:text-white max-sm:size-11"
                            aria-label={`${row.title} 反馈排班问题`}
                            onClick={() => onIssue(row)}
                          >
                            <FileWarning />
                          </Button>
                        }
                      />
                      <TooltipContent side="left">反馈排班问题</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
        </>
      ) : (
        <CompactScheduleView
          rows={rows}
          layout={layout}
          currentMoraleByOperator={currentMoraleByOperator}
          activeShift={activeShift}
          activePlan={activePlan}
          onIssue={onIssue}
        />
      )}
    </div>
  );
}

export function IssueNoteModal({
  open,
  row,
  note,
  saving,
  onNoteChange,
  onSave,
  onCancel,
}: {
  open: boolean;
  row: RoomRow | null;
  note: string;
  saving: boolean;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (open) setConsented(false);
  }, [open, row?.key]);

  return (
    <Dialog
      open={open && Boolean(row)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="max-w-[min(620px,calc(100vw-2rem))] sm:max-w-xl">
        <DialogHeader>
          <DialogDescription>反馈排班问题</DialogDescription>
          <DialogTitle>{row?.title ?? "反馈排班问题"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          将提交本次排班的诊断编号、房间名称、当前干员和你的说明；不会重复上传完整干员数据或调试包。
        </p>
        <Textarea
          autoFocus
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="例如：这组应该换成可露希尔 / 当前站位有误。"
          className="min-h-36"
          maxLength={1000}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            className="size-4"
          />
          <span>我确认提交以上排班问题信息。</span>
        </label>
        <DialogFooter>
          <Button className="max-sm:min-h-11" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button className="max-sm:min-h-11" onClick={onSave} disabled={!note.trim() || note.trim().length > 1000 || !consented || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "提交中" : "提交反馈"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssuePanel({
  issue,
  report,
  feedback,
  feedbackError,
}: {
  issue: { row: RoomRow; note: string } | null;
  report: IssueReport | null;
  feedback: FeedbackData | null;
  feedbackError: string | null;
}) {
  if (!issue || !report) {
    return (
      <div className="flex min-h-24 items-center justify-center border-y border-dashed border-border/70 py-4 text-center text-sm text-muted-foreground">
        点击房间里的“标记问题”，这里会生成反馈上下文。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium">{issue.row.title}</div>
        <div className="text-sm text-muted-foreground">{issue.row.operators.join(" / ") || "空置"}</div>
        <p className="mt-2 text-sm text-muted-foreground">{issue.note}</p>
      </div>
      {feedback ? (
        <Alert className="rounded-none border-x-0 border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 />
          <AlertDescription className="text-emerald-700">
            反馈已提交，编号：{feedback.feedbackId}
          </AlertDescription>
        </Alert>
      ) : null}
      {feedbackError ? (
        <Alert variant="destructive" className="rounded-none border-x-0">
          <AlertTriangle />
          <AlertDescription>{feedbackError}</AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        readOnly
        value={JSON.stringify(report, null, 2)}
        className="min-h-56 resize-y font-mono text-xs"
      />
    </div>
  );
}

export function DebugActions({
  result,
  onDownloadMaa,
  onDownloadBundle,
  onCopyCommand,
}: {
  result: PublicPlanData | null;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
}) {
  return (
    <div className="grid gap-2">
      <Button variant="outline" disabled={!result?.maa} onClick={onDownloadMaa}>
        <Download />
        下载 MAA
      </Button>
      <Button variant="outline" disabled={!result?.debug?.debugBundle} onClick={onDownloadBundle}>
        <Download />
        下载调试包
      </Button>
      <Button variant="outline" disabled={!result?.debug?.command} onClick={onCopyCommand}>
        复制 CLI 命令
      </Button>
    </div>
  );
}
