"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  ExternalLink,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScanLine,
  UserRound,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pollSklandQr, startSklandQr, toDisplayError } from "./api";
import { buildSklandMobileAuthUrl } from "./skland-auth-url";
import type { ShiftComparison, SklandSnapshot } from "./types";

const QRCodeSVG = dynamic(() => import("qrcode.react").then((module) => module.QRCodeSVG), { ssr: false });

type AccountProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configured: boolean;
  disabledReason?: string | null;
  snapshot: SklandSnapshot | null;
  busy: boolean;
  onAuthenticated: (snapshot: SklandSnapshot) => void;
  onRefresh: () => Promise<void>;
  onRoleChange: (uid: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

type ScanState = "idle" | "loading" | "waiting" | "scanned" | "expired";

export function SklandAccount({
  open,
  onOpenChange,
  configured,
  disabledReason,
  snapshot,
  busy,
  onAuthenticated,
  onRefresh,
  onRoleChange,
  onLogout,
}: AccountProps) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const mobileAuthUrl = scanUrl ? buildSklandMobileAuthUrl(scanUrl) : null;

  async function createQr() {
    setScanError(null);
    setScanState("loading");
    setScanId(null);
    setScanUrl(null);
    try {
      const result = await startSklandQr();
      setScanId(result.scanId);
      setScanUrl(result.scanUrl);
      setScanState("waiting");
    } catch (caught) {
      setScanState("idle");
      const detail = toDisplayError(caught, "二维码生成失败，请稍后重试。");
      setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
    }
  }

  useEffect(() => {
    if (!open || !scanId) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const result = await pollSklandQr(scanId);
        if (cancelled) return;
        if (result.status === "authenticated" && result.snapshot) {
          onAuthenticated(result.snapshot);
          onOpenChange(false);
          setScanId(null);
          setScanUrl(null);
          setScanState("idle");
          setScanError(null);
          return;
        }
        if (result.status === "expired") {
          setScanState("expired");
          setScanError("二维码已过期，请刷新。");
          return;
        }
        setScanState(result.status === "scanned" ? "scanned" : "waiting");
        setScanError(null);
      } catch (caught) {
        if (cancelled) return;
        const detail = toDisplayError(caught, "登录状态查询失败，将继续重试。");
        setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1500);
    };
    timer = window.setTimeout(() => void poll(), 1500);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [onAuthenticated, onOpenChange, open, scanId]);

  function resetLoginState() {
    setScanId(null);
    setScanUrl(null);
    setScanState("idle");
    setScanError(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next && !snapshot && configured && scanState === "idle") void createQr();
    if (!next && !snapshot) resetLoginState();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 min-w-0 justify-start px-3 max-sm:h-11 max-sm:w-full"
        aria-label={snapshot ? `森空岛账号：${snapshot.player.nickname}` : "登录森空岛"}
        onClick={() => handleOpenChange(true)}
        disabled={!configured && !snapshot}
      >
        {snapshot ? (
          <>
            <UserRound className="shrink-0" aria-hidden="true" />
            <span className="max-w-32 truncate">{snapshot.player.nickname}</span>
          </>
        ) : (
          <>
            <ScanLine />
            <span className="hidden md:inline">登录森空岛</span>
            <span className="md:hidden">森空岛</span>
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-md">
          {snapshot ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserRound className="size-4" />
                  {snapshot.player.nickname}
                </DialogTitle>
                <DialogDescription>
                  {snapshot.player.channelName} · Lv.{snapshot.player.level} · UID {snapshot.player.uid}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">绑定角色</span>
                {snapshot.roles.map((role) => (
                  <Button
                    type="button"
                    key={role.uid}
                    variant={role.uid === snapshot.player.uid ? "secondary" : "outline"}
                    className="justify-between"
                    disabled={busy || role.uid === snapshot.player.uid}
                    onClick={() => void onRoleChange(role.uid)}
                  >
                    <span className="truncate">{role.nickname} · {role.channelName}</span>
                    {role.uid === snapshot.player.uid ? <Check /> : null}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" className="h-10" variant="outline" disabled={busy} onClick={() => void onLogout()}>
                  <LogOut />退出
                </Button>
                <Button type="button" className="h-10" disabled={busy} onClick={() => void onRefresh()}>
                  <RefreshCw className={busy ? "animate-spin" : ""} />刷新数据
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>登录森空岛</DialogTitle>
                <DialogDescription>
                  桌面端使用森空岛 App 扫码；手机端可尝试通过官方通用链接打开 App。
                </DialogDescription>
              </DialogHeader>
              {!configured ? (
                <Alert>
                  <AlertDescription>{disabledReason}</AlertDescription>
                </Alert>
              ) : (
                <div className="grid place-items-center gap-3 py-1">
                  <div className="hidden size-56 place-items-center rounded-xl bg-white p-3 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] sm:grid">
                    {scanUrl ? (
                      <QRCodeSVG
                        value={scanUrl}
                        size={196}
                        title="森空岛登录二维码"
                        role="img"
                        aria-label="森空岛登录二维码"
                      />
                    ) : (
                      <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="grid w-full gap-2 sm:hidden">
                    {mobileAuthUrl ? (
                      <Button
                        render={
                          <a
                            href={mobileAuthUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="尝试在手机上打开森空岛授权"
                          />
                        }
                        className="h-11 w-full"
                      >
                        <ExternalLink />在森空岛中打开授权
                      </Button>
                    ) : (
                      <Button type="button" className="h-11 w-full" disabled>
                        <LoaderCircle className="animate-spin" />正在准备授权
                      </Button>
                    )}
                    <p className="text-pretty text-center text-xs leading-5 text-muted-foreground">
                      这是实验性入口。若只打开森空岛首页，说明当前 App 未转交登录请求，请改用桌面二维码。
                      授权后返回此页面，登录状态会自动更新。
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {scanState === "scanned"
                      ? "已扫码，请在森空岛中确认登录。"
                      : scanState === "expired"
                        ? "二维码已过期。"
                        : "等待森空岛授权…"}
                  </p>
                  {scanError ? (
                    <Alert variant="destructive">
                      <AlertDescription>{scanError}</AlertDescription>
                    </Alert>
                  ) : null}
                  {scanState === "expired" || scanError ? (
                    <Button type="button" className="h-10" variant="outline" onClick={() => void createQr()}>
                      <RefreshCw />刷新二维码
                    </Button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "未知";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp * 1000));
}

function roomLabel(group: string, index: number): string {
  const labels: Record<string, string> = { control: "控制中枢", trading: "贸易站", manufacture: "制造站", power: "发电站", dormitory: "宿舍", meeting: "会客室", hire: "办公室" };
  return `${labels[group] ?? group}${["control", "meeting", "hire"].includes(group) ? "" : ` ${index + 1}`}`;
}

export function InfrastructureSnapshot({
  snapshot,
  layoutMatches,
  onApplyLayout,
}: {
  snapshot: SklandSnapshot;
  layoutMatches: boolean;
  onApplyLayout: () => void;
}) {
  const roomOrder: Record<string, number> = {
    control: 0,
    trading: 10,
    manufacture: 20,
    power: 30,
    dormitory: 40,
    hire: 50,
    meeting: 60,
  };
  const occupied = snapshot.infrastructure.rooms
    .filter((room) => room.operators.length > 0)
    .sort((left, right) => (roomOrder[left.group] ?? 99) - (roomOrder[right.group] ?? 99) || left.index - right.index);
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={layoutMatches ? "secondary" : "destructive"}>{layoutMatches ? "布局一致" : "布局不一致"}</Badge>
        <span className="text-xs text-muted-foreground">存档于 {formatTime(snapshot.infrastructure.storeTs)}</span>
      </div>
      {!layoutMatches && snapshot.infrastructure.layoutSuggestion ? (
        <Button type="button" size="sm" variant="outline" onClick={onApplyLayout}><Building2 />应用森空岛 {snapshot.infrastructure.layoutLabel} 布局</Button>
      ) : null}
      {snapshot.infrastructure.layoutWarning ? <p className="text-xs text-amber-700">{snapshot.infrastructure.layoutWarning}</p> : null}
      <div className="divide-y divide-border/70 border-y border-border/70">
        {occupied.map((room) => (
          <div key={room.key} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs">{roomLabel(room.group, room.index)} · Lv.{room.level}</strong>
              {room.product ? <span className="text-[11px] text-muted-foreground">{room.product}</span> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {room.operators.map((operator) => (
                <Badge key={`${room.key}-${operator.id}`} variant={operator.morale <= 4 ? "destructive" : "outline"}>{operator.name} {operator.morale}</Badge>
              ))}
            </div>
            {room.production ? (
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                库存 {room.production.stock ?? "—"}/{room.production.capacity ?? "—"}
                {room.production.completed !== null ? ` · 已完成 ${room.production.completed}` : ""}
                {room.production.remaining !== null ? ` · 剩余 ${room.production.remaining}` : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>无人机：{snapshot.infrastructure.labor.value}/{snapshot.infrastructure.labor.maxValue}</span>
        <span>疲劳干员：{snapshot.infrastructure.tiredOperators.join("、") || "无"}</span>
        <span>训练室：{snapshot.infrastructure.training ? `${snapshot.infrastructure.training.trainee ?? "空"} / ${snapshot.infrastructure.training.trainer ?? "无协助"}` : "空闲"}</span>
      </div>
    </div>
  );
}

export function ShiftComparisonCard({ comparison }: { comparison: ShiftComparison | null }) {
  if (!comparison) return null;
  const groups = [
    { label: "需要换入", names: comparison.missing, tone: "text-sky-700" },
    { label: "需要换出", names: comparison.unexpected, tone: "text-amber-700" },
    { label: "位置不一致", names: comparison.misplaced, tone: "text-foreground" },
    { label: "疲劳但仍排入", names: comparison.tiredScheduled, tone: "text-destructive" },
  ] as const;
  return (
    <section className="mb-5 border-y border-primary/25 bg-primary/5 px-4 py-4 text-sm" aria-labelledby="closest-shift-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <span className="text-xs font-medium text-muted-foreground">当前状态匹配</span>
          <h3 id="closest-shift-title" className="mt-0.5 text-base font-semibold">当前最接近第 {comparison.planIndex + 1} 班</h3>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">房间匹配</span>
          <strong className="ml-2 text-lg tabular-nums">{comparison.score}%</strong>
        </div>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden bg-border/70"
        role="progressbar"
        aria-label="房间匹配百分比"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={comparison.score}
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, comparison.score))}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 sm:grid-cols-4 sm:divide-y-0">
        {groups.map((group) => (
          <div key={group.label} className="px-3 py-2 first:pl-0 sm:first:pl-0">
            <dt className="text-xs text-muted-foreground">{group.label}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", group.tone)}>{group.names.length}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-3 border-t border-border/70 pt-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-primary hover:underline hover:underline-offset-4">
          查看具体干员
        </summary>
        <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.label} className="min-w-0 border-t border-border/70 pt-3">
              <div className="flex items-center justify-between gap-3">
                <strong className={cn("text-xs", group.tone)}>{group.label}</strong>
                <span className="text-xs tabular-nums text-muted-foreground">{group.names.length}</span>
              </div>
              <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground">{group.names.join("、") || "无"}</p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
