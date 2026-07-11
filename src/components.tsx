import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  FileWarning,
  Loader2,
  Play,
  Save,
  Upload,
} from "lucide-react";
import { ChangeEvent, ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  ariaLabel,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  columns: 2 | 3;
  tone?: "default" | "trade" | "factory";
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
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          size="sm"
          variant="outline"
          className={cn(
            "min-w-0 px-2 text-xs",
            tone === "trade" &&
              "aria-pressed:border-blue-500 aria-pressed:bg-blue-600 aria-pressed:text-white data-[state=on]:border-blue-500 data-[state=on]:bg-blue-600 data-[state=on]:text-white",
            tone === "factory" &&
              "aria-pressed:border-amber-500 aria-pressed:bg-amber-600 aria-pressed:text-white data-[state=on]:border-amber-500 data-[state=on]:bg-amber-600 data-[state=on]:text-white"
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
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
    <Card className={cn("rounded-lg shadow-sm", className)}>
      <CardHeader className="gap-1 pb-1">
        <div className="flex items-start gap-2">
          {icon ? <div className="mt-0.5 text-primary">{icon}</div> : null}
          <div className="min-w-0">
            <CardTitle className="text-sm">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
    <Label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-4 py-5 text-center transition hover:border-primary/40 hover:bg-muted/40">
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
    <div className="grid grid-cols-2 gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          variant={selected.label === preset.label ? "secondary" : "outline"}
          className="h-auto min-h-16 justify-start rounded-lg px-3 py-2 text-left"
          onClick={() => onSelect(preset)}
        >
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-lg font-semibold leading-none">{preset.label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {preset.trading} 贸 / {preset.manufacture} 制 / {preset.power} 电
            </span>
          </span>
        </Button>
      ))}
    </div>
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
  return (
    <ScrollArea className="mt-3 h-[520px] pr-2">
      <div className="flex flex-col gap-2">
        {layout.rooms.map((room) => {
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
                "rounded-lg border bg-background p-3",
                isTrade && "border-blue-200 bg-blue-50/70",
                isFactory && "border-amber-200 bg-amber-50/70"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{room.id}</div>
                  <div className="text-xs text-muted-foreground">{roomKindLabel(room.kind)}</div>
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
                    className="h-7 w-12 px-1 text-center text-sm"
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
    </ScrollArea>
  );
}

export function AccountStats({ operbox }: { operbox: OperBoxEntry[] | null }) {
  const stats = [
    ["拥有干员", countOwned(operbox)],
    ["精二干员", countElite2(operbox)],
    ["六星干员", countSixStar(operbox)],
  ] as const;

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-background p-3">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold">{value}</div>
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
        "flex h-9 max-w-[520px] items-center gap-2 overflow-hidden rounded-full border px-3 text-sm shadow-xs",
        content.className
      )}
    >
      {content.icon}
      <span className="truncate">{content.text}</span>
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
    <Button onClick={onRun} disabled={!canRun || loading} size="lg">
      {loading ? <Loader2 className="animate-spin" /> : <Play />}
      {loading ? "计算中" : "生成排班"}
    </Button>
  );
}

export function ShiftTabs({
  maaJson,
  active,
  onChange,
}: {
  maaJson?: MaaJson;
  active: number;
  onChange: (index: number) => void;
}) {
  const labels = ["甲 12h", "乙 6h", "丙 6h"];
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
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const roomToneClass: Record<string, string> = {
  trading: "border-blue-200 bg-blue-50/80 [--room-accent:theme(colors.blue.600)]",
  manufacture: "border-amber-200 bg-amber-50/80 [--room-accent:theme(colors.amber.600)]",
  power: "border-emerald-200 bg-emerald-50/80 [--room-accent:theme(colors.emerald.600)]",
  control: "border-sky-200 bg-sky-50/80 [--room-accent:theme(colors.sky.600)]",
  dormitory: "border-cyan-200 bg-cyan-50/80 [--room-accent:theme(colors.cyan.700)]",
};

function efficiencyPercent(row: RoomRow): number | null {
  const value = row.group === "trading"
    ? row.efficiency?.trade_skill_pct
    : row.group === "manufacture"
      ? row.efficiency?.manu_prod_skill
      : row.group === "power"
        ? row.efficiency?.power_skill_pct
          ?? (typeof row.efficiency?.power_score === "number" ? Math.max(0, row.efficiency.power_score - 100) : undefined)
        : undefined;

  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 300)) : null;
}

export function ScheduleBoard({
  rows,
  layout,
  onIssue,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  rows: RoomRow[];
  layout: BaseBlueprint;
  onIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
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

  return (
    <div className="flex flex-col gap-4">
      {rowGroups.map((group) => (
        <section key={group.label} className="grid grid-cols-[repeat(auto-fill,minmax(184px,232px))] justify-start gap-2.5" aria-label={group.label}>
          {group.rows.map((row) => {
            const layoutRoom = layout.rooms.find((room) => room.id === row.roomId);
            const isTrade = layoutRoom?.kind === "trade_post";
            const isFactory = layoutRoom?.kind === "factory";
            const isPower = layoutRoom?.kind === "power_plant";
            const activeOrder = isTrade ? tradeOrderFor(layoutRoom) : null;
            const activeRecipe = isFactory ? factoryRecipeFor(layoutRoom) : null;
            const efficiency = efficiencyPercent(row);
            const isLmdOrder = isTrade && row.product === "龙门币";

            return (
              <Card
                key={row.key}
                size="sm"
                className={cn(
                  "relative min-h-32 overflow-hidden rounded-lg pl-1 shadow-xs before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--room-accent)]",
                  roomToneClass[row.group] ?? "border-border bg-background [--room-accent:theme(colors.neutral.500)]",
                  row.suspicious && "border-destructive"
                )}
              >
                <CardHeader className="gap-2 pb-0 pl-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="min-w-0 truncate text-sm">
                      {row.title}
                      {row.level ? (
                        <Badge variant="outline" className="ml-1 align-middle">
                          {row.level} 级
                        </Badge>
                      ) : null}
                    </CardTitle>
                    {row.product ? (
                      <Badge variant="secondary" className="max-w-20 truncate">
                        {row.product}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pl-3">
                  {isTrade && activeOrder ? (
                    <ProductToggleGroup
                      ariaLabel={`${row.title} 订单`}
                      value={activeOrder}
                      options={TRADE_ORDER_OPTIONS.map((option) => ({
                        value: option.order,
                        label: option.label,
                      }))}
                      columns={2}
                      tone="trade"
                      onChange={(order) => onTradeOrderChange(row.roomId, order)}
                    />
                  ) : isFactory && activeRecipe ? (
                    <ProductToggleGroup
                      ariaLabel={`${row.title} 配方`}
                      value={activeRecipe}
                      options={FACTORY_RECIPE_OPTIONS.map((option) => ({
                        value: option.recipe,
                        label: option.label,
                      }))}
                      columns={3}
                      tone="factory"
                      onChange={(recipe) => onFactoryRecipeChange(row.roomId, recipe)}
                    />
                  ) : null}

                  <div className="flex min-h-11 flex-wrap gap-1">
                    {row.operators.length > 0 ? (
                      row.operators.map((operator) => (
                        <Badge key={operator} variant="outline" className="bg-background/80">
                          {operator}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="bg-background/70 text-muted-foreground">
                        空置
                      </Badge>
                    )}
                  </div>
                  {isTrade || isFactory || isPower ? (
                    <div className="mt-1.5 flex items-baseline justify-between rounded-md border border-[var(--room-accent)]/25 bg-background/60 px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">效率</span>
                      <div className="text-right">
                        <strong className="text-lg leading-none text-[var(--room-accent)]">
                          {efficiency === null ? "—" : `${efficiency.toFixed(0)}%`}
                        </strong>
                        {!isLmdOrder && row.efficiencyLabel ? (
                          <span className="ml-1 text-[10px] text-muted-foreground" title={row.efficiencyLabel}>
                            {row.efficiencyLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-2 pl-3">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{row.rule}</span>
                  <Button type="button" variant="outline" size="xs" onClick={() => onIssue(row)}>
                    <FileWarning />
                    标记问题
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </section>
      ))}
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
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
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
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 />
          <AlertDescription className="text-emerald-700">
            已保存 box：{feedback.relativeOperboxPath ?? feedback.operboxPath ?? feedback.relativePath ?? feedback.feedbackId}
          </AlertDescription>
        </Alert>
      ) : null}
      {feedbackError ? (
        <Alert variant="destructive">
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
