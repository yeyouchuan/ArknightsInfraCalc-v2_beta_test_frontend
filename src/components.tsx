import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  FileWarning,
  Loader2,
  Play,
  Save,
  Smile,
  Upload,
} from "lucide-react";
import { CSSProperties, ChangeEvent, ReactNode, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { manufacturePoolReady, presentRoomEfficiency, profileEfficiency, RoomEfficiencyPresentation } from "./efficiency";
import { countElite2, countOwned, countSixStar } from "./operbox";
import { RoomRow } from "./schedule";
import {
  BaseBlueprint,
  FeedbackApiResponse,
  IssueReport,
  MaaJson,
  OperBoxEntry,
  PlanApiResponse,
  PresetDef,
  RotationJson,
  UserProfile,
} from "./types";

type Option<T extends string> = {
  value: T;
  label: string;
};

function ProductToggleGroup<T extends string>({
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
  columns: 2 | 3;
  tone?: "default" | "trade" | "factory";
  surface?: "default" | "room";
  ariaLabel: string;
}) {
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
        "grid w-full",
        columns === 2 ? "grid-cols-2" : "grid-cols-3"
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
              surface === "default" && "min-h-10",
              surface === "room" && "border-white/20 bg-[#3C3C3C]/70 px-1.5 text-[10px] text-white hover:bg-[#4B4B4B] hover:text-white sm:px-2 sm:text-xs",
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
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? <div className="mt-0.5 text-primary">{icon}</div> : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
        支持前端导出的 operbox.json，也支持一图流 xlsx
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
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  等级
                  <Input
                    aria-label={`${room.id} 等级`}
                    type="number"
                    min={1}
                    max={levelMax}
                    step={1}
                    value={room.level}
                    className="h-10 w-16 rounded-lg px-2 text-center text-sm tabular-nums"
                    onChange={(event) => {
                      const level = Number(event.target.value);
                      if (Number.isInteger(level) && level >= 1 && level <= levelMax) onRoomLevelChange(room.id, level);
                    }}
                  />
                </Label>
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
                    columns={3}
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
    <div className="mt-3 grid grid-cols-3 divide-x divide-border/70 border-y border-border/70">
      {stats.map(([label, value]) => (
        <div key={label} className="px-3 py-3">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function StatusBar({
  loading,
  result,
  error,
  cliPath,
}: {
  loading: boolean;
  result: PlanApiResponse | null;
  error: string | null;
  cliPath: string | null;
}) {
  const content = (() => {
    if (loading) {
      return {
        icon: <Loader2 className="size-4 animate-spin" />,
        text: "正在通过 infra-cli serve 排班",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    }
    if (error) {
      return {
        icon: <AlertTriangle className="size-4" />,
        text: error,
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    }
    if (result?.success) {
      return {
        icon: <CheckCircle2 className="size-4" />,
        text: `运行完成，${result.durationMs ?? "?"}ms`,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    return {
      icon: <CircleHelp className="size-4" />,
      text: cliPath ? `CLI: ${cliPath}` : "等待连接本地 CLI 服务",
      className: "border-border bg-background text-muted-foreground",
    };
  })();

  return (
    <div
      className={cn(
        "surface-shadow col-span-1 flex h-10 min-w-0 items-center gap-2 overflow-hidden rounded-lg px-3 text-sm max-sm:col-span-3",
        content.className
      )}
    >
      {content.icon}
      <span className="truncate tabular-nums">{content.text}</span>
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
    <Button className="h-10 min-w-0 px-3 max-sm:w-full" aria-label={loading ? "计算中" : "生成排班"} onClick={onRun} disabled={!canRun || loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      <span className="hidden md:inline">{loading ? "计算中" : "生成排班"}</span>
      <span className="md:hidden">{loading ? "计算" : "生成"}</span>
    </Button>
  );
}

export function ShiftTabs({
  maaJson,
  active,
  closest,
  onChange,
}: {
  maaJson?: MaaJson;
  active: number;
  closest?: number;
  onChange: (index: number) => void;
}) {
  const labels = ["α 12h", "β 6h", "γ 6h"];
  const plans = maaJson?.plans ?? [];

  if (plans.length === 0) {
    return (
      <Button type="button" variant="outline" disabled size="sm">
        等待结果
      </Button>
    );
  }

  return (
    <Tabs value={String(active)} onValueChange={(value) => onChange(Number(value))}>
      <TabsList>
        {plans.map((plan, index) => (
          <TabsTrigger key={`${plan.name}-${index}`} value={String(index)}>
            {labels[index] ?? plan.name ?? `班次 ${index + 1}`}
            {closest === index ? <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">最接近</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function compactNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.0$/, "");
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
  const summary = profile?.summary;
  const manufactureReady = summary ? manufacturePoolReady(summary) : undefined;
  const dailyMetrics = [
    { label: "24h 贸易", value: rotation?.daily.trade, suffix: "×" },
    { label: "24h 制造", value: rotation?.daily.manu, suffix: "%" },
    { label: "24h 发电", value: rotation?.daily.power, suffix: "%" },
  ].filter((metric): metric is { label: string; value: number; suffix: string } => typeof metric.value === "number");
  const domains = profile?.domains ?? [];

  return (
    <section className="mb-4 overflow-hidden border-y border-[#313131]/15 bg-[#F3F1EA]" aria-label="CLI 求解概览">
      <div className="grid grid-cols-[auto_1fr] items-stretch max-md:grid-cols-1">
        <div className="flex min-w-36 flex-col justify-center bg-[#313131] px-4 py-3 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">CLI schema</span>
          <strong className="mt-0.5 text-xl font-medium">v{profile?.schema_version ?? "—"}</strong>
          <span className="mt-1 text-xs text-white/62">
            {layout.template} · {layout.rooms.length} 个设施
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] divide-x divide-[#313131]/10 max-sm:divide-x-0 max-sm:grid-cols-2">
          {dailyMetrics.map((metric) => (
            <div key={metric.label} className="px-4 py-3">
              <span className="block text-[11px] text-[#313131]/58">{metric.label}</span>
              <strong className="mt-0.5 block text-lg font-semibold tabular-nums text-[#313131]">
                {compactNumber(metric.value, 2)}{metric.suffix}
              </strong>
            </div>
          ))}
          {active ? (
            <div className="px-4 py-3">
              <span className="block text-[11px] text-[#313131]/58">当前班次</span>
              <strong className="mt-0.5 block text-lg font-semibold tabular-nums text-[#313131]">
                {compactNumber(active.duration_hours)}h
              </strong>
            </div>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[#313131]/10 px-4 py-2 text-xs text-[#313131]/68">
          <span>已拥有 <strong className="text-[#313131]">{summary.owned}</strong></span>
          <span>进阶可用 <strong className="text-[#313131]">{summary.tier_up_owned}</strong></span>
          <span>贸易候选 <strong className="text-[#313131]">{summary.trade_pool_ready}</strong></span>
          {manufactureReady !== undefined ? <span>制造候选 <strong className="text-[#313131]">{manufactureReady}</strong></span> : null}
          <span>中枢等级 <strong className="text-[#313131]">Lv.{layout.rooms.find((room) => room.kind === "control_center")?.level ?? "—"}</strong></span>
        </div>
      ) : null}

      {domains.length > 0 || profile?.actions.length || profile?.flags.length || profile?.narration_hints.length ? (
        <details className="group border-t border-[#313131]/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium text-[#313131] marker:content-none">
            <span>CLI 评估详情 · {domains.length} 个指标</span>
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
                        {domain.current.operators.length ? <span className="block truncate text-[10px] text-[#313131]/52">{domain.current.operators.join(" / ")}</span> : null}
                      </div>
                      <span className="tabular-nums text-[#313131]">当前 {current === undefined ? "—" : compactNumber(current, 2)}</span>
                      <span className="tabular-nums text-[#313131]/55 max-sm:hidden">基准 {baseline === undefined ? "—" : compactNumber(baseline, 2)}</span>
                      <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-semibold", profileSeverityClass(domain.severity))}>
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
                {[...(profile?.flags ?? []), ...(profile?.narration_hints ?? [])].map((flag) => <span key={flag} className="bg-[#313131]/7 px-1.5 py-0.5 text-[10px] text-[#313131]/65">{flag}</span>)}
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
    background: "/images/building-room-backgrounds/bk_trading.webp",
  },
  manufacture: {
    accent: "#FFD800",
    level: "#FFD800",
    background: "/images/building-room-backgrounds/bk_manufacture.webp",
  },
  power: {
    accent: "#B8F03A",
    level: "#B8F03A",
    background: "/images/building-room-backgrounds/bk_power.webp",
  },
  control: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_control.webp",
  },
  dormitory: {
    accent: "#016E65",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_dormitory.webp",
  },
  meeting: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_meeting.webp",
  },
  processing: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_workshop.webp",
  },
  hire: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_hire.webp",
  },
  training: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_training.webp",
  },
  default: {
    accent: "#FFFFFF",
    level: "#FFFFFF",
    background: "/images/building-room-backgrounds/bk_none.webp",
  },
};

function roomVisualFor(group: string): RoomVisual {
  return ROOM_VISUALS[group] ?? ROOM_VISUALS.default;
}

function LevelDiamonds({ level, maxLevel }: { level?: number; maxLevel?: number }) {
  if (!level) return null;
  const count = Math.max(1, Math.min(level, 5));

  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label={`${level} 级，最高 ${maxLevel ?? level} 级`}>
      <span className="flex translate-y-[-0.5px] gap-0.5" aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <span
            key={index}
            className="block h-6 w-3 bg-[var(--room-level)] shadow-[0_0_8px_rgba(255,255,255,0.25)] [clip-path:polygon(50%_0,100%_24%,100%_76%,50%_100%,0_76%,0_24%)] max-sm:h-4 max-sm:w-2"
          />
        ))}
      </span>
      <span className="shrink-0 text-[10px] font-semibold text-white/64 max-sm:text-[8px]">Lv.{level}/{maxLevel ?? level}</span>
    </span>
  );
}

function RoomEfficiencyReadout({ value, details = true }: { value: RoomEfficiencyPresentation; details?: boolean }) {
  return (
    <div className="mb-1.5 min-w-0" title={value.details.map((detail) => `${detail.label} ${detail.value}`).join(" · ")}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <strong className="shrink-0 text-base leading-none tabular-nums text-[var(--room-accent)] max-sm:text-xs">{value.primaryValue}</strong>
        <span className="truncate text-[10px] font-medium text-white/68 max-sm:text-[8px]">{value.primaryLabel}</span>
        {value.includesCrossStation ? <span className="shrink-0 bg-white/12 px-1 py-0.5 text-[8px] font-semibold text-white/82">含跨设施</span> : null}
      </div>
      {details && value.details.length ? (
        <div className="mt-1 flex max-h-8 flex-wrap gap-x-2 gap-y-0.5 overflow-hidden text-[9px] leading-3 text-white/56 max-sm:mt-0.5 max-sm:max-h-3 max-sm:text-[7px]">
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

function RoomEfficiencyDetails({ value }: { value: RoomEfficiencyPresentation | null }) {
  if (!value?.details.length) return null;

  return (
    <div
      className="ml-6 grid min-w-[160px] max-w-[240px] gap-1 text-sm leading-tight text-white/62 max-sm:hidden"
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

function RoomProductControls({
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
      <div className="w-[178px] max-w-full max-sm:w-[106px]">
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
      <div className="w-[288px] max-w-full max-sm:w-[174px]">
        <ProductToggleGroup
          ariaLabel={`${row.title} 配方`}
          value={activeRecipe}
          options={FACTORY_RECIPE_OPTIONS.map((option) => ({
            value: option.recipe,
            label: option.label,
          }))}
          columns={3}
          tone="factory"
          surface="room"
          onChange={(recipe) => onFactoryRecipeChange(row.roomId, recipe)}
        />
      </div>
    );
  }

  if (!row.product) return null;

  return <div className="text-lg font-medium leading-none text-[var(--room-accent)]">{row.product}</div>;
}

function OperatorSlot({
  slot,
  currentMorale,
}: {
  slot: RoomRow["operatorSlots"][number] | undefined;
  currentMorale?: number;
}) {
  if (!slot) {
    return (
      <div
        className="relative aspect-square h-[clamp(70px,7.3vw,88px)] min-w-0 shrink overflow-hidden border-2 border-[#4B4B4B] bg-[#3C3C3C] after:absolute after:left-1/2 after:top-1/2 after:h-0.5 after:w-[78%] after:origin-center after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-[-45deg] after:bg-[#4B4B4B] after:content-[''] max-sm:h-[clamp(32px,11vw,40px)] max-sm:border"
        aria-label="空置"
      />
    );
  }

  return (
    <div
      className="relative aspect-square h-[clamp(70px,7.3vw,88px)] min-w-0 shrink overflow-hidden border-2 border-[#7F7F7F] bg-[#3C3C3C] shadow-[inset_0_0_18px_rgba(255,255,255,0.16)] max-sm:h-[clamp(32px,11vw,40px)] max-sm:border"
      title={slot.label}
    >
      {slot.portrait ? (
        <img src={slot.portrait} alt={slot.name} className="absolute inset-0 h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
      ) : (
        <div className="flex h-full items-center justify-center bg-[#4B4B4B] px-2 text-center text-xs font-semibold text-white">
          {slot.name}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60" />
      {typeof currentMorale === "number" ? (
        <span
          className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-sm bg-black/72 px-1 py-0.5 text-[10px] font-semibold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.5)] [&_svg]:size-2.5 max-sm:bottom-0.5 max-sm:left-0.5 max-sm:px-0.5 max-sm:text-[8px] max-sm:[&_svg]:size-2"
          aria-label={`当前心情 ${currentMorale}/24`}
          title={`当前心情 ${currentMorale}/24`}
        >
          <Smile className="text-[#FFD501]" />
          <span className="max-sm:hidden">当前</span>
          <span>{currentMorale}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ScheduleBoard({
  rows,
  layout,
  currentMoraleByOperator,
  onIssue,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  rows: RoomRow[];
  layout: BaseBlueprint;
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  onIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [hiddenGroups, setHiddenGroups] = useState<Record<string, boolean>>({});

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        没有可展示的布局房间。
      </div>
    );
  }

  const rowGroups = rows.reduce<{ label: string; rows: RoomRow[] }[]>((groups, row) => {
    const group = groups.find((item) => item.label === row.groupLabel);
    if (group) {
      group.rows.push(row);
    } else {
      groups.push({ label: row.groupLabel, rows: [row] });
    }
    return groups;
  }, []);
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
                className="flex min-w-0 items-center gap-2.5 text-left"
                aria-expanded={!collapsed}
                onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
              >
                <span className="h-7 w-1.5 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
                <h3 className="truncate text-[21px] font-medium leading-none text-[#313131]">{group.label}</h3>
                <span className="text-xs text-[#313131]/52">{group.rows.length}</span>
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
            <div className={cn("grid min-w-0 gap-3 pb-2", collapsed && "hidden")}>
              {group.rows.map((row) => {
                const layoutRoom = layout.rooms.find((room) => room.id === row.roomId);
                const rowVisual = roomVisualFor(row.group);
                const efficiency = presentRoomEfficiency(row.group, row.efficiency);
                const slotCount = roomSlotCountFor(row.group);
                const slots = Array.from({ length: slotCount }, (_, index) => row.operatorSlots[index]);
                const rowStyle = {
                  "--room-accent": rowVisual.accent,
                  "--room-level": rowVisual.level,
                } as CSSProperties;

                return (
                  <div
                    key={row.key}
                    className={cn(
                      "relative flex h-[144px] w-full overflow-hidden bg-[#313131] text-white shadow-[0_10px_20px_rgba(0,0,0,0.24)] max-sm:h-auto max-sm:flex-col",
                      row.suspicious && "ring-2 ring-destructive ring-offset-2"
                    )}
                    style={rowStyle}
                  >
                    <div className="relative w-[330px] shrink-0 overflow-hidden bg-[#313131] max-sm:min-h-[128px] max-sm:w-full">
                      <div
                        className="absolute inset-0 bg-left bg-no-repeat opacity-[0.52]"
                        style={{
                          backgroundImage: `url(${rowVisual.background})`,
                          backgroundPosition: "-18px center",
                          backgroundSize: "auto 176px",
                        }}
                        aria-hidden="true"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#313131]/20 via-[#313131]/72 to-[#313131]" />
                      <div className="relative z-10 flex h-full flex-col justify-center px-3 py-3 max-sm:px-3 max-sm:py-3">
                        <div>
                          <div className="flex items-start gap-2.5 max-sm:gap-1.5">
                            <div className="min-w-0 truncate text-[23px] font-medium leading-none tracking-normal text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.75)] max-sm:text-[16px]">
                              {row.title}
                            </div>
                            <LevelDiamonds level={row.level} maxLevel={layoutRoom ? maxRoomLevel(layoutRoom.kind) : row.level} />
                          </div>
                        </div>
                        <div className="h-2" />
                        {efficiency ? <RoomEfficiencyReadout value={efficiency} details={false} /> : null}
                        <RoomProductControls
                          row={row}
                          layoutRoom={layoutRoom}
                          onFactoryRecipeChange={onFactoryRecipeChange}
                          onTradeOrderChange={onTradeOrderChange}
                        />
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-1 items-center gap-5 py-2 pl-12 pr-10 max-sm:flex-col max-sm:items-stretch max-sm:gap-2 max-sm:px-3 max-sm:pb-3 max-sm:pt-0">
                      <div
                        className={cn(
                          "grid min-w-0 flex-1 items-center justify-items-center gap-2.5 max-sm:flex max-sm:overflow-x-auto max-sm:pb-1",
                          slotCount === 3 ? "grid-cols-3" : "grid-cols-5"
                        )}
                      >
                        {slots.map((slot, index) => (
                          <OperatorSlot
                            key={`${slot?.name ?? "empty"}-${index}`}
                            slot={slot}
                            currentMorale={slot ? currentMoraleByOperator?.get(slot.name) : undefined}
                          />
                        ))}
                      </div>
                      <RoomEfficiencyDetails value={efficiency} />
                    </div>

                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute right-2 top-2 border border-white/10 bg-[#3C3C3C]/55 text-white/70 hover:bg-[#4B4B4B] hover:text-white"
                            aria-label={`${row.title} 标记问题`}
                            onClick={() => onIssue(row)}
                          >
                            <FileWarning />
                          </Button>
                        }
                      />
                      <TooltipContent side="left">标记问题</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
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
  return (
    <Dialog
      open={open && Boolean(row)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="max-w-[min(620px,calc(100vw-2rem))] sm:max-w-xl">
        <DialogHeader>
          <DialogDescription>输入 note</DialogDescription>
          <DialogTitle>{row?.title ?? "标记问题"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">写下为什么要标记这个房间。</p>
        <Textarea
          autoFocus
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="例如：这组应该换成可露希尔 / 当前站位有误。"
          className="min-h-36"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onSave} disabled={!note.trim() || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "保存中" : "保存到服务器"}
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
  feedback: FeedbackApiResponse | null;
  feedbackError: string | null;
}) {
  if (!issue || !report) {
    return (
      <div className="flex min-h-24 items-center justify-center border-y border-dashed border-border/70 py-4 text-center text-sm text-muted-foreground">
        点击房间里的“标记问题”，这里会生成反馈上下文。
      </div>
    );
  }

  const savedReport: IssueReport = feedback?.success
    ? {
        ...report,
        savedFiles: {
          feedbackDir: feedback.relativePath ?? feedback.path,
          issue: feedback.relativeIssuePath ?? feedback.issuePath,
          operbox: feedback.relativeOperboxPath ?? feedback.operboxPath,
          debugBundle: feedback.relativeDebugBundlePath ?? feedback.debugBundlePath,
        },
      }
    : report;

  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium">{issue.row.title}</div>
        <div className="text-sm text-muted-foreground">{issue.row.operators.join(" / ") || "空置"}</div>
        <p className="mt-2 text-sm text-muted-foreground">{issue.note}</p>
      </div>
      {feedback?.success ? (
        <Alert className="rounded-none border-x-0 border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 />
          <AlertDescription className="text-emerald-700">
            已保存 box：{feedback.relativeOperboxPath ?? feedback.operboxPath ?? feedback.relativePath ?? feedback.feedbackId}
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
        value={JSON.stringify(savedReport, null, 2)}
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
  result: PlanApiResponse | null;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
}) {
  return (
    <div className="grid gap-2">
      <Button variant="outline" disabled={!result?.maaJson} onClick={onDownloadMaa}>
        <Download />
        下载 MAA
      </Button>
      <Button variant="outline" disabled={!result?.debugBundle} onClick={onDownloadBundle}>
        <Download />
        下载调试包
      </Button>
      <Button variant="outline" disabled={!result?.command} onClick={onCopyCommand}>
        复制 CLI 命令
      </Button>
    </div>
  );
}
