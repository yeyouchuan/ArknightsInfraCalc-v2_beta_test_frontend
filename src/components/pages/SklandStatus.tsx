"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  Check,
  Clipboard,
  Database,
  DoorOpen,
  HeartPulse,
  LogOut,
  PackageCheck,
  Search,
  Shirt,
  Sparkles,
  UserPlus,
  UsersRound,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelDiamonds, OperatorSlot, roomVisualFor } from "@/components";
import {
  InfraTechnicalCard as OverviewTechnicalCard,
  InfraTechnicalHeading as OverviewTechnicalHeading,
} from "@/components/InfraTechnicalCard";
import { cn } from "@/lib/utils";
import { operatorPortraitFor } from "@/operatorPortraits";
import { roomGridTone } from "@/schedule-view-presentation";
import { SklandLoginPanel } from "@/skland-components";
import {
  deriveSklandBuildingMetrics,
  type SklandStatusMetric,
} from "@/skland-status-metrics";
import type {
  DisplayError,
  SklandAccountSummary,
  SklandInfrastructureRoom,
  SklandOperatorStatus,
  SklandOwnedSkin,
  SklandSessionData,
  SklandSnapshot,
} from "@/types";

const PRODUCT_LABELS: Record<string, string> = {
  gold: "贵金属 / 赤金",
  battle_record: "作战记录",
  originium: "源石碎片",
  unknown: "其他配方",
};

const PROFESSION_LABELS: Record<string, string> = {
  PIONEER: "先锋",
  WARRIOR: "近卫",
  TANK: "重装",
  SNIPER: "狙击",
  CASTER: "术师",
  MEDIC: "医疗",
  SUPPORT: "辅助",
  SPECIAL: "特种",
  TOKEN: "召唤物",
  TRAP: "装置",
  UNKNOWN: "未分类",
};

const ROOM_LABELS: Record<SklandInfrastructureRoom["group"], string> = {
  control: "控制中枢",
  trading: "贸易站",
  manufacture: "制造站",
  power: "发电站",
  dormitory: "宿舍",
  meeting: "会客室",
  hire: "人力办公室",
};

const INITIAL_LIST_LIMIT = 60;
const RARITY_OPTIONS = [
  { value: "all", label: "全部星级" },
  ...[6, 5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} 星` })),
];

interface SklandStatusProps {
  snapshot: SklandSnapshot | null;
  accounts: SklandAccountSummary[];
  activeAccountId: string | null;
  sessionLoading: boolean;
  layoutMatches: boolean;
  layoutDirty: boolean;
  configured: boolean;
  disabledReason: string | null;
  busy: boolean;
  error: DisplayError | null;
  onAuthenticated: (session: SklandSessionData) => void;
  onRoleChange: (accountId: string, uid: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onApplyLayout: () => void;
  onContinueSetup: () => void;
  onOpenCalculator: () => void;
  onCopyUid: (uid: string) => void;
}

function formatDateTime(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCompactDateTime(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  const time = [date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${time}`;
}

function formatDate(timestamp: number | null): string {
  const date = timestamp !== null && timestamp > 0 && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  if (!date || Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (!safeSeconds) return "已完成";
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${Math.max(1, minutes)} 分钟`;
}

function useMinuteTimestamp(baseTimestamp: number): number {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  useEffect(() => {
    setElapsedMinutes(0);
    const timer = window.setInterval(() => setElapsedMinutes((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [baseTimestamp]);
  return baseTimestamp + elapsedMinutes * 60;
}

function maskedUid(uid: string): string {
  if (uid.length <= 6) return `${uid.slice(0, 2)}••${uid.slice(-2)}`;
  return `${uid.slice(0, 3)}••••${uid.slice(-3)}`;
}

function roomLabel(room: SklandInfrastructureRoom): string {
  const base = ROOM_LABELS[room.group];
  return ["control", "meeting", "hire"].includes(room.group) ? base : `${base} ${room.index + 1}`;
}

function roomMaxLevel(room: SklandInfrastructureRoom): number {
  return room.group === "control" || room.group === "dormitory" ? 5 : 3;
}

function professionLabel(profession: string): string {
  return PROFESSION_LABELS[profession] ?? profession;
}

function ProgressMeter({
  label,
  current,
  total,
  technical = false,
}: {
  label: string;
  current: number;
  total: number;
  technical?: boolean;
}) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeCurrent / safeTotal) * 100)) : 0;
  const ariaMax = Math.max(1, safeTotal);
  const ariaCurrent = Math.min(ariaMax, safeCurrent);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className={technical ? "text-white/58" : "text-muted-foreground"}>{label}</span>
        <span className={cn("font-medium tabular-nums", technical && "text-[var(--room-accent)]")}>
          {safeCurrent}/{safeTotal}
        </span>
      </div>
      <div
        className={cn(
          "h-1.5 overflow-hidden",
          technical ? "bg-white/12" : "rounded-full bg-muted"
        )}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={ariaMax}
        aria-valuenow={ariaCurrent}
      >
        <div
          className={cn("h-full", technical ? "bg-[var(--room-accent)]" : "rounded-full bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function OverviewTab({
  snapshot,
  onContinueSetup,
  onOpenCalculator,
}: {
  snapshot: SklandSnapshot;
  onContinueSetup: () => void;
  onOpenCalculator: () => void;
}) {
  const { infrastructure, player, progress } = snapshot;
  const fullProductionRooms = infrastructure.rooms.filter(
    (room) =>
      (room.group === "trading" || room.group === "manufacture")
      && room.production.stock !== null
      && room.production.capacity !== null
      && room.production.capacity > 0
      && room.production.stock >= room.production.capacity
  );
  const readyRecruit = (progress.recruit ?? []).filter(
    (slot) => slot.state === "completed"
      || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= infrastructure.currentTs)
  );
  const dronesFull = infrastructure.labor.maxValue > 0
    && infrastructure.labor.value >= infrastructure.labor.maxValue;
  const attentionItems = [
    infrastructure.tiredOperators.length
      ? `${infrastructure.tiredOperators.length} 名干员心情过低`
      : null,
    fullProductionRooms.length
      ? `${fullProductionRooms.length} 个生产设施库存已满`
      : null,
    readyRecruit.length ? `${readyRecruit.length} 个公开招募槽位已完成` : null,
    dronesFull ? "无人机已达到上限" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="grid gap-3">
      <section
        className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
        aria-label="现在值得处理"
      >
        <OverviewTechnicalCard group="manufacture" className="min-h-40">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <OverviewTechnicalHeading icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
                  现在值得处理
                </OverviewTechnicalHeading>
                <p className="mt-3 text-lg font-semibold">
                  {attentionItems.length ? `${attentionItems.length} 项状态提醒` : "基建运转平稳"}
                </p>
              </div>
              <strong className="text-4xl font-semibold tabular-nums text-[var(--room-accent)]">
                {attentionItems.length}
              </strong>
            </div>
            <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {attentionItems.length ? attentionItems.map((item) => (
                <div key={item} className="flex items-start gap-2 border-t border-white/10 pt-2 text-sm text-white/82">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-[var(--room-accent)]"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </div>
              )) : (
                <p className="border-t border-white/10 pt-2 text-sm text-white/58 sm:col-span-2">
                  当前没有库存、公招、训练或心情方面的明确提醒。
                </p>
              )}
            </div>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="control" className="min-h-40">
          <div className="grid h-full content-between gap-4">
            <div>
              <OverviewTechnicalHeading icon={<Database className="size-4" aria-hidden="true" />}>
                已同步到排班助手
              </OverviewTechnicalHeading>
              <p className="mt-4 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {snapshot.operators.length}
                <span className="ml-1 text-sm font-normal text-white/60">名干员</span>
              </p>
              <p className="mt-1 text-xs text-white/58">
                当前布局 · {infrastructure.layoutLabel ?? "未识别"}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Button
                type="button"
                className="h-11 justify-between bg-white text-[#272a2b] hover:bg-white/90"
                onClick={onOpenCalculator}
              >
                前往生成排班 <Sparkles />
              </Button>
              <Button
                type="button"
                className="h-11 justify-between border-white/22 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                variant="outline"
                onClick={onContinueSetup}
              >
                继续配置布局 <Building2 />
              </Button>
            </div>
          </div>
        </OverviewTechnicalCard>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="状态摘要">
        <OverviewTechnicalCard group="trading" className="min-h-36 md:col-span-2 xl:col-span-1">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<HeartPulse className="size-4" aria-hidden="true" />}>
              当前理智
            </OverviewTechnicalHeading>
            <div className="mt-5 flex items-end gap-1">
              <strong className="text-4xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.sanity?.current ?? "—"}
              </strong>
              {player.sanity ? (
                <span className="pb-1 text-sm tabular-nums text-white/52">/ {player.sanity.max}</span>
              ) : null}
            </div>
            <p className="mt-auto pt-4 text-xs text-white/58">
              {!player.sanity
                ? "森空岛暂未提供理智状态"
                : player.sanity.current >= player.sanity.max
                  ? "理智已满"
                  : `预计回满：${formatDateTime(player.sanity.completeRecoveryTime)}`}
            </p>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="power" className="min-h-36">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Zap className="size-4" aria-hidden="true" />}>
              无人机
            </OverviewTechnicalHeading>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-[var(--room-accent)]">
              {infrastructure.labor.value}
              <span className="ml-1 text-sm font-normal text-white/52">
                / {infrastructure.labor.maxValue}
              </span>
            </p>
            <p className="mt-auto pt-4 text-xs text-white/58">
              {dronesFull
                ? "无人机已达当前上限"
                : `下次恢复约 ${formatDuration(infrastructure.labor.remainSecs)}`}
            </p>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="manufacture" className="min-h-36">
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
              日常与周常
            </OverviewTechnicalHeading>
            <div className="mt-5 grid gap-3">
              {progress.routine ? (
                <>
                  <ProgressMeter technical label="日常" {...progress.routine.daily} />
                  <ProgressMeter technical label="周常" {...progress.routine.weekly} />
                </>
              ) : (
                <p className="text-xs text-white/58">森空岛暂未提供任务进度。</p>
              )}
            </div>
          </div>
        </OverviewTechnicalCard>
      </section>

      <section
        className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
        aria-label="博士档案与收藏"
      >
        <OverviewTechnicalCard group="control" className="min-h-48">
          <OverviewTechnicalHeading icon={<UsersRound className="size-4" aria-hidden="true" />}>
            博士档案
          </OverviewTechnicalHeading>
          <p className="mt-3 text-base font-semibold text-white">{player.nickname}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">注册时间</dt>
              <dd className="mt-1 font-medium text-white">{formatDate(player.registerTs)}</dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">主线进度</dt>
              <dd className="mt-1 font-medium text-[var(--room-accent)]">
                {player.mainStageProgress ?? "未提供"}
              </dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">助理</dt>
              <dd className="mt-1 font-medium text-white">{player.secretary?.name ?? "未提供"}</dd>
            </div>
            <div className="border-t border-white/10 pt-2">
              <dt className="text-white/50">月卡到期</dt>
              <dd className="mt-1 font-medium text-white">{formatDate(player.subscriptionEnd)}</dd>
            </div>
          </dl>
          {player.resume ? (
            <p className="mt-4 border-t border-white/10 pt-3 text-sm leading-6 text-white/58">{player.resume}</p>
          ) : null}
        </OverviewTechnicalCard>

        <OverviewTechnicalCard group="trading" className="min-h-48">
          <OverviewTechnicalHeading icon={<Boxes className="size-4" aria-hidden="true" />}>
            收藏概况
          </OverviewTechnicalHeading>
          <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-3">
            <div className="px-3 first:pl-0">
              <dt className="text-xs text-white/50">干员</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.operators ?? "—"}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs text-white/50">皮肤</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.skins ?? "—"}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs text-white/50">家具</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                {player.counts.furniture ?? "—"}
              </dd>
            </div>
          </dl>
        </OverviewTechnicalCard>
      </section>

      <section aria-labelledby="overview-recruit-title">
        <OverviewTechnicalCard group="hire" className="min-h-36">
          <OverviewTechnicalHeading icon={<PackageCheck className="size-4" aria-hidden="true" />}>
            <span id="overview-recruit-title">公开招募</span>
          </OverviewTechnicalHeading>
          {progress.recruit?.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {progress.recruit.map((slot) => {
                const finished = slot.state === "completed"
                  || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= infrastructure.currentTs);
                const label = finished
                  ? "已完成"
                  : slot.state === "locked"
                    ? "未解锁"
                    : slot.state === "standby"
                      ? "空闲"
                      : "进行中";
                return (
                  <div key={slot.index} className="border-t border-white/12 bg-black/12 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <strong>槽位 {slot.index + 1}</strong>
                      <span className={finished ? "text-[var(--room-accent)]" : "text-white/58"}>
                        {label}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-nowrap text-xs tabular-nums text-white/58">
                      {slot.finishTs > 0 ? formatDateTime(slot.finishTs) : "暂无计时"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-5 text-sm text-white/58">森空岛暂未提供公招计时。</p>}
        </OverviewTechnicalCard>
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: SklandInfrastructureRoom }) {
  const productionRoom = room.group === "trading" || room.group === "manufacture" ? room : null;
  const isPowerRoom = room.group === "power";
  const hasRoomDetails = productionRoom !== null || room.group === "meeting" || room.group === "hire";
  const visual = roomVisualFor(room.group);
  const gridTone = roomGridTone(room.group);
  const style = {
    "--room-accent": visual.accent,
    "--room-level": visual.level,
    "--room-grid-color": gridTone.color,
    "--room-grid-opacity": gridTone.opacity,
    "--room-grid-fade-start": gridTone.fadeStart,
  } as CSSProperties;

  return (
    <article
      className={`infra-room-surface relative gap-2 overflow-hidden px-3 py-2 text-white ${
        isPowerRoom
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-start max-sm:grid-cols-1"
          : "flex min-h-36 flex-col"
      }`}
      data-room-group={room.group}
      style={style}
    >
      <div className="contents">
        <div
          className="infra-room-emblem absolute inset-0 bg-left bg-no-repeat"
          style={{
            backgroundImage: `url(${visual.background})`,
            backgroundPosition: "-18px center",
            backgroundSize: "auto 100%",
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 flex min-h-7 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="infra-room-accent h-5 w-1 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
            <h4 className="truncate text-sm font-medium tracking-[-0.02em] text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.75)]">
              {roomLabel(room)}
            </h4>
            <LevelDiamonds level={room.level} maxLevel={roomMaxLevel(room)} variant="compact" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-white/64 max-sm:ml-3 max-sm:w-full max-sm:flex-wrap">
            {productionRoom ? (
              <strong className="infra-room-value text-xs font-semibold text-[var(--room-accent)]">
                {PRODUCT_LABELS[productionRoom.product] ?? productionRoom.product}
              </strong>
            ) : null}
            {room.group === "manufacture" ? <span>生产力 {Math.round(room.speed * 100)}%</span> : null}
            {room.group === "dormitory" ? <span>氛围 {room.comfort}</span> : null}
            {room.group === "hire" ? <span>可刷新 {room.refreshCount} 次</span> : null}
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 min-w-0 ${
          isPowerRoom
            ? "flex justify-end max-sm:justify-start"
            : "grid flex-1 content-between gap-2"
        }`}
      >
        <div className={`flex flex-wrap items-start gap-3 ${isPowerRoom ? "justify-end max-sm:justify-start" : ""}`}>
          {room.operators.length ? room.operators.map((operator) => (
            <OperatorSlot
              key={`${room.key}-${operator.id}`}
              slot={{
                name: operator.name,
                label: `${operator.name} · 已工作 ${formatDuration(operator.workTime)}`,
                portrait: operatorPortraitFor(operator.name),
              }}
              currentMorale={operator.morale}
              compactView
            />
          )) : <span className="py-2 text-sm text-white/48">当前没有进驻干员</span>}
        </div>

        {hasRoomDetails ? <div className="border-t border-white/10 pt-2 text-xs leading-5 text-white/58">
          {productionRoom ? (
            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 xl:flex-nowrap">
              <div className="flex items-baseline gap-1 whitespace-nowrap">
                <dt>库存</dt>
                <dd className="font-medium tabular-nums text-white">
                  {productionRoom.production.stock ?? "—"} / {productionRoom.production.capacity ?? "—"}
                </dd>
              </div>
              <div className="flex items-baseline gap-1 whitespace-nowrap">
                <dt>预计完成</dt>
                <dd
                  className="font-medium tabular-nums text-white"
                  data-infra-complete-time
                >
                  {formatCompactDateTime(productionRoom.production.completeWorkTime)}
                </dd>
              </div>
              {productionRoom.production.completed !== null ? (
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <dt>已完成</dt>
                  <dd className="font-medium tabular-nums text-white">{productionRoom.production.completed}</dd>
                </div>
              ) : null}
              {productionRoom.production.remaining !== null ? (
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <dt>剩余队列</dt>
                  <dd className="font-medium tabular-nums text-white">{productionRoom.production.remaining}</dd>
                </div>
              ) : null}
            </dl>
          ) : room.group === "meeting" ? (
            <div className="grid gap-1">
              <p>线索板：{room.clue.board.join("、") || "暂无"}</p>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span>已有 {room.clue.own} · 待接收 {room.clue.needReceive} · 已接收 {room.clue.received}</span>
                <span className="flex items-baseline gap-x-2 xl:ml-auto">
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">
                    {room.clue.sharing
                      ? `线索交流至 ${formatDateTime(room.clue.shareCompleteTime)}`
                      : "当前未进行线索交流"}
                  </span>
                </span>
              </p>
            </div>
          ) : room.group === "hire" ? (
            <p>下次完成 {formatDateTime(room.completeWorkTime)}</p>
          ) : null}

          {room.group === "trading" && room.orders.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-[var(--room-accent)]">
                查看 {room.orders.length} 笔订单
              </summary>
              <div className="mt-2 grid gap-1">
                {room.orders.map((order, index) => (
                  <p key={`${room.key}-order-${index}`}>
                    订单 {index + 1}：交付 {order.delivery.reduce((total, item) => total + item.count, 0)}
                    ，获得 {order.reward.count} {order.reward.type === "orundum" ? "合成玉" : "龙门币"}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </div> : null}
      </div>
    </article>
  );
}

function BuildingMetricCard({ metric }: { metric: SklandStatusMetric }) {
  const group = metric.visual === "rest"
    ? "dormitory"
    : metric.visual === "clue"
      ? "meeting"
      : metric.visual;

  return (
    <div
      className="h-full min-w-0"
      data-skland-metric={metric.id}
      data-metric-tone={metric.tone}
    >
      <OverviewTechnicalCard group={group} className="h-full min-h-40" showEmblem={false}>
        <div className="flex h-full min-w-0 flex-col">
          <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
            {metric.label}
          </OverviewTechnicalHeading>
          <div className="mt-5 flex min-w-0 items-end gap-1">
            <strong className="min-w-0 truncate text-3xl font-semibold leading-none tabular-nums text-[var(--room-accent)]">
              {metric.value}
            </strong>
            {metric.total !== null ? (
              <span className="mb-0.5 shrink-0 text-sm leading-none tabular-nums text-white/52">
                / {metric.total}
              </span>
            ) : null}
          </div>
          <p className="mt-auto pt-4 text-xs leading-5 text-white/58">{metric.hint}</p>
        </div>
      </OverviewTechnicalCard>
    </div>
  );
}

function LayoutSyncControl({
  snapshot,
  layoutMatches,
  layoutDirty,
  onApplyLayout,
}: {
  snapshot: SklandSnapshot;
  layoutMatches: boolean;
  layoutDirty: boolean;
  onApplyLayout: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { infrastructure } = snapshot;

  function requestApplyLayout() {
    if (layoutDirty) setConfirmOpen(true);
    else onApplyLayout();
  }

  const hasSuggestion = Boolean(infrastructure.layoutSuggestion);
  const status = hasSuggestion
    ? `森空岛布局 ${infrastructure.layoutLabel ?? "未识别"}`
    : "未识别可同步布局";

  return (
    <>
      <div
        className="flex min-w-0 items-center gap-2"
        data-slot="skland-layout-sync"
        aria-label="布局同步"
        aria-live="polite"
      >
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 text-xs",
            layoutMatches ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {layoutMatches
            ? <Check className="size-3.5 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{status}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 max-sm:h-11"
          disabled={!hasSuggestion || layoutMatches}
          onClick={requestApplyLayout}
        >
          <Building2 />
          {layoutMatches ? "已同步" : hasSuggestion ? "应用布局" : "不可同步"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>覆盖当前布局设置？</DialogTitle>
            <DialogDescription>
              你已经手动修改过当前布局。继续后会使用森空岛的设施等级、制造配方和贸易订单。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button
              type="button"
              onClick={() => {
                onApplyLayout();
                setConfirmOpen(false);
              }}
            >
              覆盖并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfrastructureTab({ snapshot }: { snapshot: SklandSnapshot }) {
  const { infrastructure } = snapshot;
  const now = useMinuteTimestamp(infrastructure.currentTs);
  const buildingMetrics = useMemo(() => deriveSklandBuildingMetrics(snapshot, now), [snapshot, now]);
  const controlRooms = infrastructure.rooms.filter((room) => room.group === "control");
  const workRooms = infrastructure.rooms.filter((room) => room.group === "trading" || room.group === "manufacture");
  const powerRooms = infrastructure.rooms.filter((room) => room.group === "power");
  const functionRooms = infrastructure.rooms.filter((room) => room.group === "meeting" || room.group === "hire");
  const dormitoryRooms = infrastructure.rooms.filter((room) => room.group === "dormitory");

  return (
    <div className="grid gap-7">
      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-label="基建概览"
        data-skland-overview-grid
        data-skland-metric-section="building"
      >
        <OverviewTechnicalCard
          group="training"
          className="min-h-40"
          dataSlot="skland-training-room"
          showEmblem={false}
        >
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Activity className="size-4" aria-hidden="true" />}>
              训练室
            </OverviewTechnicalHeading>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-[var(--room-accent)]">
              {infrastructure.training?.trainee ?? "当前空闲"}
            </p>
            <div className="mt-auto pt-4 text-xs leading-5 text-white/58">
            {infrastructure.training ? (
              <>
                <p>技能 {infrastructure.training.skillIndex} · 协助：{infrastructure.training.trainer ?? "无"}</p>
                <p>剩余 {formatDuration(infrastructure.training.remainSecs)} · 加速 {Math.round(infrastructure.training.speed * 100)}%</p>
              </>
            ) : "暂无训练任务"}
            </div>
          </div>
        </OverviewTechnicalCard>

        <OverviewTechnicalCard
          group="power"
          className="min-h-40"
          dataSlot="skland-infra-assets"
          showEmblem={false}
        >
          <div className="flex h-full flex-col">
            <OverviewTechnicalHeading icon={<Boxes className="size-4" aria-hidden="true" />}>
              基建资产
            </OverviewTechnicalHeading>
            <p className="mt-5 text-3xl font-semibold tabular-nums text-[var(--room-accent)]">
              {infrastructure.furnitureTotal}
              <span className="ml-1 text-sm font-normal text-white/58">件家具</span>
            </p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs text-white/58">
              <span>无人机 {infrastructure.labor.value}/{infrastructure.labor.maxValue}</span>
              <span>低心情干员 {infrastructure.tiredOperators.length} 名</span>
            </div>
          </div>
        </OverviewTechnicalCard>

        {buildingMetrics.map((metric) => <BuildingMetricCard key={metric.id} metric={metric} />)}
      </section>

      {infrastructure.layoutWarning ? (
        <Alert>
          <AlertDescription>{infrastructure.layoutWarning}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="skland-compact-layout-title">
        <div className="mb-3 flex min-w-0 items-end justify-between gap-3 border-b border-border/70 pb-3">
          <h3 id="skland-compact-layout-title" className="min-w-0 text-lg font-semibold tracking-[-0.025em]">
            当前基建
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{infrastructure.rooms.length} 个设施</span>
        </div>

        <div
          className="grid items-stretch gap-3 xl:-mx-[80px] xl:grid-cols-[minmax(0,55fr)_minmax(19rem,45fr)]"
          data-skland-compact-layout
        >
          <div
            className="flex min-w-0 flex-col gap-3 xl:justify-between"
            data-skland-compact-column="production"
          >
            {controlRooms.map((room) => <RoomCard key={room.key} room={room} />)}

            {workRooms.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {workRooms.map((room) => <RoomCard key={room.key} room={room} />)}
            </div> : null}

            {powerRooms.length ? <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {powerRooms.map((room) => <RoomCard key={room.key} room={room} />)}
            </div> : null}
          </div>

          <div
            className="flex min-w-0 flex-col gap-3 xl:justify-between"
            data-skland-compact-column="auxiliary"
          >
            {functionRooms.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
              {functionRooms.map((room) => <RoomCard key={room.key} room={room} />)}
            </div> : null}

            {dormitoryRooms.map((room) => <RoomCard key={room.key} room={room} />)}
          </div>
        </div>
      </section>

    </div>
  );
}

function OperatorCard({ operator }: { operator: SklandOperatorStatus }) {
  return (
    <article className="[content-visibility:auto] [contain-intrinsic-size:16rem] border-t border-border/70 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate font-medium">{operator.name}</h4>
            {operator.isAssist ? <Badge variant="secondary">助战</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {operator.rarity}★ · {professionLabel(operator.profession)} / {operator.subProfessionName}
          </p>
        </div>
        <Badge variant="outline">精 {operator.elite} Lv.{operator.level}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted-foreground">潜能</dt><dd className="mt-0.5 font-medium">{operator.potential}</dd></div>
        <div><dt className="text-muted-foreground">信赖</dt><dd className="mt-0.5 font-medium">{operator.favorPercent}%</dd></div>
        <div><dt className="text-muted-foreground">技能</dt><dd className="mt-0.5 font-medium">Lv.{operator.mainSkillLevel}</dd></div>
      </dl>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium text-primary">专精、模组与皮肤</summary>
        <div className="mt-2 grid gap-1.5 leading-5 text-muted-foreground">
          <p>
            专精：{operator.skills.length
              ? operator.skills.map((skill) => `S${skill.index} M${skill.specializeLevel}`).join(" · ")
              : "森空岛暂未提供"}
          </p>
          <p>
            模组：{operator.modules.length
              ? operator.modules.map((module) => `${module.name} Lv.${module.level}${module.isDefault ? "（使用中）" : ""}`).join(" · ")
              : "无"}
          </p>
          <p>当前皮肤：{operator.currentSkinName ?? "默认服装"}</p>
          <p>获得时间：{formatDate(operator.acquiredAt)}</p>
        </div>
      </details>
    </article>
  );
}

function SkinCard({ skin }: { skin: SklandOwnedSkin }) {
  return (
    <article className="[content-visibility:auto] border-t border-border/70 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium">{skin.name}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{skin.operatorName} · {skin.brandId}</p>
        </div>
        {skin.isCurrent ? <Badge variant="secondary">使用中</Badge> : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">获得于 {formatDate(skin.obtainedAt)}</p>
    </article>
  );
}

export function OperatorsTab({ snapshot }: { snapshot: SklandSnapshot }) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState("all");
  const [profession, setProfession] = useState("all");
  const [operatorLimit, setOperatorLimit] = useState(INITIAL_LIST_LIMIT);
  const [skinLimit, setSkinLimit] = useState(INITIAL_LIST_LIMIT);
  const professions = useMemo(
    () => [...new Set(snapshot.operators.map((operator) => operator.profession))]
      .sort((left, right) => professionLabel(left).localeCompare(professionLabel(right), "zh-CN")),
    [snapshot.operators]
  );
  const professionOptions = useMemo(
    () => [
      { value: "all", label: "全部职业" },
      ...professions.map((value) => ({ value, label: professionLabel(value) })),
    ],
    [professions]
  );
  const filteredOperators = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.operators
      .filter((operator) => !normalizedQuery || operator.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
      .filter((operator) => rarity === "all" || operator.rarity === Number(rarity))
      .filter((operator) => profession === "all" || operator.profession === profession)
      .sort((left, right) =>
        right.rarity - left.rarity
        || right.elite - left.elite
        || right.level - left.level
        || left.name.localeCompare(right.name, "zh-CN")
      );
  }, [profession, query, rarity, snapshot.operators]);
  const filteredSkins = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.skins
      .filter((skin) =>
        !normalizedQuery
        || skin.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || skin.operatorName.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      )
      .sort((left, right) => right.obtainedAt - left.obtainedAt || left.name.localeCompare(right.name, "zh-CN"));
  }, [query, snapshot.skins]);

  function updateQuery(value: string) {
    setQuery(value);
    setOperatorLimit(INITIAL_LIST_LIMIT);
    setSkinLimit(INITIAL_LIST_LIMIT);
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl bg-muted/45 p-3 md:grid-cols-[minmax(0,1fr)_10rem_12rem]">
        <label className="relative">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            className="h-11 pl-9"
            placeholder="搜索干员或皮肤"
            aria-label="搜索干员或皮肤"
          />
        </label>
        <Select
          value={rarity}
          items={RARITY_OPTIONS}
          onValueChange={(value) => {
            setRarity(value ?? "all");
            setOperatorLimit(INITIAL_LIST_LIMIT);
          }}
        >
          <SelectTrigger className="h-11 w-full"><SelectValue placeholder="星级" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部星级</SelectItem>
            {RARITY_OPTIONS.slice(1).map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={profession}
          items={professionOptions}
          onValueChange={(value) => {
            setProfession(value ?? "all");
            setOperatorLimit(INITIAL_LIST_LIMIT);
          }}
        >
          <SelectTrigger className="h-11 w-full"><SelectValue placeholder="职业" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部职业</SelectItem>
            {professionOptions.slice(1).map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="operators">
        <div className="overflow-x-auto pb-1">
          <TabsList variant="line" className="min-w-max">
            <TabsTrigger value="operators" className="h-10 px-4">
              <UsersRound />干员 {filteredOperators.length}
            </TabsTrigger>
            <TabsTrigger value="skins" className="h-10 px-4">
              <Shirt />皮肤 {filteredSkins.length}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="operators" className="pt-3">
          {filteredOperators.length ? (
            <>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredOperators.slice(0, operatorLimit).map((operator) => (
                  <OperatorCard key={operator.id} operator={operator} />
                ))}
              </div>
              {operatorLimit < filteredOperators.length ? (
                <Button
                  type="button"
                  className="mt-6 h-11 w-full"
                  variant="outline"
                  onClick={() => setOperatorLimit((current) => current + INITIAL_LIST_LIMIT)}
                >
                  显示更多干员
                </Button>
              ) : null}
            </>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">没有符合筛选条件的干员。</p>}
        </TabsContent>
        <TabsContent value="skins" className="pt-3">
          {filteredSkins.length ? (
            <>
              <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredSkins.slice(0, skinLimit).map((skin) => <SkinCard key={skin.id} skin={skin} />)}
              </div>
              {skinLimit < filteredSkins.length ? (
                <Button
                  type="button"
                  className="mt-6 h-11 w-full"
                  variant="outline"
                  onClick={() => setSkinLimit((current) => current + INITIAL_LIST_LIMIT)}
                >
                  显示更多皮肤
                </Button>
              ) : null}
            </>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">森空岛暂未提供皮肤数据。</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgressSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border/70 pt-5">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProgressTab({ snapshot }: { snapshot: SklandSnapshot }) {
  const { player, progress } = snapshot;
  const now = useMinuteTimestamp(snapshot.infrastructure.currentTs);
  return (
    <div className="grid gap-7">
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card className="surface-shadow ring-0">
          <CardHeader>
            <CardDescription>博士档案</CardDescription>
            <CardTitle>{player.nickname}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-muted-foreground">注册时间</dt><dd className="mt-1 font-medium">{formatDate(player.registerTs)}</dd></div>
              <div><dt className="text-muted-foreground">主线进度</dt><dd className="mt-1 font-medium">{player.mainStageProgress ?? "未提供"}</dd></div>
              <div><dt className="text-muted-foreground">助理</dt><dd className="mt-1 font-medium">{player.secretary?.name ?? "未提供"}</dd></div>
              <div><dt className="text-muted-foreground">月卡到期</dt><dd className="mt-1 font-medium">{formatDate(player.subscriptionEnd)}</dd></div>
            </dl>
            {player.resume ? <p className="border-t pt-3 leading-6 text-muted-foreground">{player.resume}</p> : null}
          </CardContent>
        </Card>
        <Card className="surface-shadow ring-0">
          <CardHeader>
            <CardDescription>收藏概况</CardDescription>
            <CardTitle>
              {player.counts.operators === null ? "暂未提供" : `${player.counts.operators} 名干员`}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">皮肤</span><strong className="mt-1 block text-lg">{player.counts.skins ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">家具</span><strong className="mt-1 block text-lg">{player.counts.furniture ?? "—"}</strong></div>
          </CardContent>
        </Card>
      </section>

      <ProgressSection title="公开招募" description="完成时间以本次森空岛存档为准。">
        {progress.recruit?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {progress.recruit.map((slot) => {
              const finished = slot.state === "completed"
                || (slot.state === "recruiting" && slot.finishTs > 0 && slot.finishTs <= now);
              const label = finished
                ? "已完成"
                : slot.state === "locked"
                  ? "未解锁"
                  : slot.state === "standby"
                    ? "空闲"
                    : "进行中";
              return (
                <div key={slot.index} className="rounded-lg bg-muted/45 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <strong>槽位 {slot.index + 1}</strong>
                    <Badge variant={finished ? "secondary" : "outline"}>{label}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {slot.finishTs > 0 ? formatDateTime(slot.finishTs) : "暂无计时"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供公招计时。</p>}
      </ProgressSection>

      <ProgressSection title="作战进度" description="剿灭、保全派驻与集成战略。">
        {progress.campaign || progress.tower || progress.rogue ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {progress.campaign ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><PackageCheck className="size-4" />剿灭作战</div>
                <ProgressMeter label="奖励进度" {...progress.campaign.reward} />
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.campaign.records.map((record) => (
                    <p key={`${record.zoneName}-${record.name}`}>
                      {record.zoneName ? `${record.zoneName} · ` : ""}{record.name}：{record.maxKills}
                    </p>
                  ))}
                  {!progress.campaign.records.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
            {progress.tower ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><Boxes className="size-4" />保全派驻</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.tower.records.map((record) => (
                    <p key={`${record.name}-${record.subName}`}>{record.name}{record.subName ? ` · ${record.subName}` : ""}：{record.best}</p>
                  ))}
                  {!progress.tower.records.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
            {progress.rogue ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><DoorOpen className="size-4" />集成战略</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {progress.rogue.map((record) => (
                    <p key={record.name}>{record.name}：藏品 {record.relicCount} · 银行 {record.bankCurrent}/{record.bankRecord}</p>
                  ))}
                  {!progress.rogue.length ? <p>暂无记录</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供作战进度。</p>}
      </ProgressSection>

      <ProgressSection title="活动记录" description="只展示森空岛返回的关卡完成情况，不加载活动宣传链接。">
        {progress.activities?.length || progress.bossRush?.length ? (
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {(progress.activities ?? []).map((activity) => (
              <article key={`${activity.name}-${activity.startTime}`} className="border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{activity.name}</strong>
                  {activity.isReplicate ? <Badge variant="outline">复刻</Badge> : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  关卡 {activity.clearedStages}/{activity.totalStages} · 至 {formatDate(activity.endTime)}
                </p>
              </article>
            ))}
            {(progress.bossRush ?? []).map((record, index) => (
              <article key={`${record.stageCode}-${index}`} className="border-t border-border/70 pt-3">
                <strong>{record.stageCode ?? "首领活动"} {record.stageName ?? ""}</strong>
                <p className="mt-2 text-xs text-muted-foreground">
                  {record.played ? "已有记录" : "尚未挑战"} · {record.difficulty}
                </p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">森空岛暂未提供活动记录。</p>}
      </ProgressSection>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-5" role="status" aria-label="正在恢复森空岛会话">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    </div>
  );
}

export function SklandStatus({
  snapshot,
  accounts,
  activeAccountId,
  sessionLoading,
  layoutMatches,
  layoutDirty,
  configured,
  disabledReason,
  busy,
  error,
  onAuthenticated,
  onRoleChange,
  onLogout,
  onApplyLayout,
  onContinueSetup,
  onOpenCalculator,
  onCopyUid,
}: SklandStatusProps) {
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  if (sessionLoading) return <LoadingState />;

  if (!snapshot) {
    return (
      <div className="grid gap-6 py-2 sm:py-5">
        <header className="max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-primary">森空岛状态中心</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">把当前罗德岛带进排班助手</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            登录、角色切换和退出都集中在这里。二维码只会在你点击后生成。
          </p>
        </header>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}（{error.code}）</AlertDescription>
          </Alert>
        ) : null}
        <SklandLoginPanel
          configured={configured}
          disabledReason={disabledReason}
          onAuthenticated={onAuthenticated}
        />
      </div>
    );
  }

  const selectionItems = accounts.flatMap((account) =>
    account.roles.map((role) => ({
      value: `${account.accountId}:${role.uid}`,
      label: `${role.nickname} · ${role.channelName}`,
      accountId: account.accountId,
      uid: role.uid,
    }))
  );
  const selectedValue = activeAccountId ? `${activeAccountId}:${snapshot.player.uid}` : "";

  return (
    <div className="grid gap-6">
      <header className="grid gap-5 border-b border-border/70 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-4">
          {snapshot.player.avatarUrl ? (
            <img
              src={snapshot.player.avatarUrl}
              alt={`${snapshot.player.nickname}的森空岛头像`}
              referrerPolicy="no-referrer"
              className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div
              className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
              role="img"
              aria-label={`${snapshot.player.nickname}的森空岛头像`}
            >
              {snapshot.player.nickname.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold tracking-tight">{snapshot.player.nickname}</h2>
              {snapshot.player.level !== null ? <Badge variant="secondary">Lv.{snapshot.player.level}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{snapshot.player.channelName}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => onCopyUid(snapshot.player.uid)}
                aria-label="复制完整 UID"
              >
                UID {maskedUid(snapshot.player.uid)} <Clipboard className="size-3" />
              </button>
              <span>同步于 {formatDateTime(snapshot.infrastructure.storeTs)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Select
            value={selectedValue}
            items={selectionItems}
            disabled={busy}
            onValueChange={(value) => {
              const selection = selectionItems.find((item) => item.value === value);
              if (selection && value !== selectedValue) void onRoleChange(selection.accountId, selection.uid);
            }}
          >
            <SelectTrigger
              className="col-span-2 h-9 w-full data-[size=default]:h-9 max-sm:h-11 max-sm:data-[size=default]:h-11 sm:w-56"
              data-skland-account-select
            >
              <SelectValue placeholder="选择账号与角色" />
            </SelectTrigger>
            <SelectContent className="min-w-64">
              {accounts.map((account, accountIndex) => {
                const selectedRole = account.roles.find((role) => role.uid === account.selectedUid) ?? account.roles[0];
                return (
                  <SelectGroup key={account.accountId}>
                    {accountIndex > 0 ? <SelectSeparator /> : null}
                    <SelectLabel>
                      森空岛账号 {accountIndex + 1}{selectedRole ? ` · ${selectedRole.nickname}` : ""}
                    </SelectLabel>
                    {account.roles.map((role) => (
                      <SelectItem key={`${account.accountId}:${role.uid}`} value={`${account.accountId}:${role.uid}`}>
                        {role.nickname} · {role.channelName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            type="button"
            className="h-9 max-sm:h-11"
            variant="outline"
            disabled={busy || accounts.length >= 5}
            title={accounts.length >= 5 ? "最多可登录 5 个森空岛账号" : undefined}
            onClick={() => setAddAccountOpen(true)}
            data-skland-add-account
          >
            <UserPlus />添加账号
          </Button>
          <Button
            type="button"
            className="h-9 max-sm:h-11"
            variant="destructive"
            disabled={busy}
            onClick={() => void onLogout()}
            data-skland-logout
          >
            <LogOut />退出
          </Button>
        </div>
      </header>

      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[min(1040px,calc(100vw-2rem))]">
          <DialogHeader className="px-5 py-5 pr-16 sm:px-7">
            <DialogTitle className="text-lg">添加森空岛账号</DialogTitle>
            <DialogDescription>
              扫码后会保留现有账号，并将新账号设为当前账号。最多同时登录 5 个账号。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
            <SklandLoginPanel
              className="max-w-none"
              configured={configured}
              disabledReason={disabledReason}
              onAuthenticated={(session) => {
                onAuthenticated(session);
                setAddAccountOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message}（{error.code}）。已保留上一次成功同步的数据。
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.warnings.length ? (
        <Alert>
          <AlertDescription>
            {snapshot.warnings.join(" ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" data-skland-view-header>
          <div className="-mx-3 min-w-0 overflow-x-auto overflow-y-hidden px-3 pb-1">
            <TabsList className="min-w-max" data-skland-view-tabs>
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="infrastructure">基建</TabsTrigger>
            </TabsList>
          </div>
          <LayoutSyncControl
            snapshot={snapshot}
            layoutMatches={layoutMatches}
            layoutDirty={layoutDirty}
            onApplyLayout={onApplyLayout}
          />
        </div>
        <TabsContent value="overview" className="pt-5">
          <OverviewTab snapshot={snapshot} onContinueSetup={onContinueSetup} onOpenCalculator={onOpenCalculator} />
        </TabsContent>
        <TabsContent value="infrastructure" className="pt-5">
          <InfrastructureTab snapshot={snapshot} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
