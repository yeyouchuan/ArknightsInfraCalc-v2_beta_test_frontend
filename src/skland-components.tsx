"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { pollSklandQr, startSklandQr, toDisplayError } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildSklandAppOpenUrl } from "@/skland-auth-url";
import type { ShiftComparison, SklandSessionData } from "@/types";

const SKLAND_APP_OPEN_URL = buildSklandAppOpenUrl();
const SKLAND_QR_POLL_INTERVAL_MS = 6_000;

type ScanState = "idle" | "loading" | "waiting" | "scanned" | "expired";

interface SklandLoginPanelProps {
  configured: boolean;
  disabledReason?: string | null;
  onAuthenticated: (session: SklandSessionData) => void;
  className?: string;
}

export function SklandLoginPanel({
  configured,
  disabledReason,
  onAuthenticated,
  className,
}: SklandLoginPanelProps) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanExpiresAt, setScanExpiresAt] = useState<number | null>(null);
  const [preparingSlow, setPreparingSlow] = useState(false);
  const createQrPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const createQr = useCallback(() => {
    if (createQrPromiseRef.current) return createQrPromiseRef.current;
    const task = (async () => {
      setScanError(null);
      setScanState("loading");
      setScanId(null);
      setScanUrl(null);
      setScanExpiresAt(null);
      try {
        const result = await startSklandQr();
        if (!mountedRef.current) return;
        setScanId(result.scanId);
        setScanUrl(result.scanUrl);
        setScanExpiresAt(Date.now() + result.expiresInSeconds * 1000);
        setScanState("waiting");
      } catch (error) {
        if (!mountedRef.current) return;
        const detail = toDisplayError(error, "二维码生成失败，请稍后重试。");
        setScanState("idle");
        setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
      }
    })();
    createQrPromiseRef.current = task;
    void task.finally(() => {
      if (createQrPromiseRef.current === task) createQrPromiseRef.current = null;
    });
    return task;
  }, []);

  useEffect(() => {
    if (scanState !== "loading") {
      setPreparingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setPreparingSlow(true), 2_000);
    return () => window.clearTimeout(timer);
  }, [scanState]);

  useEffect(() => {
    if (!scanId || !scanExpiresAt) return;
    const remaining = scanExpiresAt - Date.now();
    if (remaining <= 0) {
      setScanId(null);
      setScanState("expired");
      return;
    }
    const timer = window.setTimeout(() => {
      setScanId(null);
      setScanState("expired");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [scanExpiresAt, scanId]);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const result = await pollSklandQr(scanId);
        if (cancelled) return;
        if (
          result.status === "authenticated" &&
          result.snapshot &&
          result.accounts &&
          result.activeAccountId
        ) {
          onAuthenticated({
            authenticated: true,
            configured: true,
            accounts: result.accounts,
            activeAccountId: result.activeAccountId,
            snapshot: result.snapshot,
          });
          setScanId(null);
          setScanUrl(null);
          setScanExpiresAt(null);
          setScanState("idle");
          setScanError(null);
          return;
        }
        if (result.status === "expired") {
          setScanId(null);
          setScanState("expired");
          setScanError(null);
          return;
        }
        setScanState(result.status === "scanned" ? "scanned" : "waiting");
        setScanError(null);
      } catch (error) {
        if (cancelled) return;
        const detail = toDisplayError(error, "登录状态查询失败，将继续重试。");
        setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), SKLAND_QR_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(() => void poll(), SKLAND_QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [onAuthenticated, scanId]);

  const statusText = scanState === "loading"
    ? preparingSlow
      ? "正在连接鹰角登录服务，首次准备可能需要更久。"
      : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，请在森空岛中确认登录。"
      : scanState === "expired"
        ? "二维码已过期，请重新生成。"
        : scanUrl
          ? "等待森空岛扫码授权…"
          : "二维码不会自动生成，准备好后再开始登录。";
  const mobileStatusText = scanState === "loading"
    ? preparingSlow
      ? "正在连接登录服务…"
      : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，请在 App 中确认。"
      : scanState === "expired"
        ? "二维码已过期，请重新生成。"
        : scanUrl
          ? "等待扫码确认…"
          : "点击按钮生成二维码。";

  return (
    <Card
      className={cn("surface-shadow w-full overflow-hidden rounded-none ring-0", className)}
      data-skland-login-panel
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="px-6 py-7 md:px-8 md:py-9" data-skland-login-copy>
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanLine className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">登录森空岛账号</CardTitle>
          <CardDescription className="max-w-md text-pretty leading-6">
            <span className="md:hidden">打开森空岛 App 扫码登录，成功后自动同步排班所需数据。</span>
            <span className="hidden md:inline">
              打开森空岛 App，扫描页面中的二维码完成登录。登录成功后会自动同步当前角色的干员、基建和游戏进度。
            </span>
          </CardDescription>
          <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="md:hidden">登录信息仅加密保存在当前浏览器。</span>
              <span className="hidden md:inline">
                账号登录信息会加密保存在当前浏览器中，我们不会把它保存到服务器数据库。
              </span>
            </p>
            <p>
              <span className="md:hidden">仅读取排班所需数据，不会自动签到。</span>
              <span className="hidden md:inline">这里只读取排班需要的游戏数据，不会自动签到，也不会读取社区内容。</span>
            </p>
            <p className="text-xs">
              森空岛登录能力基于开源项目{" "}
              <a
                href="https://github.com/AEtherside/skland-kit"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                skland-kit
              </a>
              {" "}实现。
            </p>
          </div>
        </div>

        <CardContent
          className="order-first grid min-h-64 place-items-center px-6 py-7 md:order-none md:min-h-80 md:px-8"
          data-skland-login-qr
        >
          {!configured ? (
            <Alert>
              <AlertDescription>
                {disabledReason ?? "当前未开放森空岛登录，可继续使用 MAA 导入。"}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid w-full place-items-center gap-4">
              {scanUrl || scanState === "loading" ? (
                <div className="grid size-52 place-items-center rounded-xl bg-white p-3 ring-1 ring-black/10 sm:size-56">
                  {scanUrl ? (
                    <QRCodeSVG
                      value={scanUrl}
                      size={196}
                      className="size-full"
                      title="森空岛登录二维码"
                      role="img"
                      aria-label="森空岛登录二维码"
                    />
                  ) : (
                    <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
              ) : (
                <div className="grid size-36 place-items-center rounded-full bg-muted text-muted-foreground">
                  <ScanLine className="size-12" aria-hidden="true" />
                </div>
              )}

              <p className="text-center text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">
                <span className="md:hidden">{mobileStatusText}</span>
                <span className="hidden md:inline">{statusText}</span>
              </p>

              {scanError ? (
                <Alert variant="destructive">
                  <AlertDescription>{scanError}</AlertDescription>
                </Alert>
              ) : null}

              {scanUrl ? (
                <div className="grid w-full gap-2 sm:hidden">
                  <Button
                    nativeButton={false}
                    render={<a href={SKLAND_APP_OPEN_URL} target="_blank" rel="noreferrer" />}
                    className="h-11 w-full"
                  >
                    <ExternalLink />打开森空岛 App
                  </Button>
                  <p className="text-pretty text-center text-xs leading-5 text-muted-foreground">
                    请用森空岛扫描上方二维码；必要时可在另一台设备展示。
                  </p>
                </div>
              ) : null}

              {!scanUrl || scanState === "expired" || scanError ? (
                <Button
                  type="button"
                  className="h-11 min-w-36"
                  variant={scanState === "idle" && !scanError ? "default" : "outline"}
                  disabled={scanState === "loading"}
                  onClick={() => void createQr()}
                >
                  {scanState === "loading" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  <span className="md:hidden">
                    {scanState === "idle" && !scanError ? "生成二维码" : "重新生成"}
                  </span>
                  <span className="hidden md:inline">
                    {scanState === "idle" && !scanError ? "生成登录二维码" : "重新生成二维码"}
                  </span>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </div>
    </Card>
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
          <h3 id="closest-shift-title" className="mt-0.5 text-base font-semibold">
            当前最接近第 {comparison.planIndex + 1} 班
          </h3>
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
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, comparison.score))}%` }}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 sm:grid-cols-4 sm:divide-y-0">
        {groups.map((group) => (
          <div key={group.label} className="px-3 py-2 first:pl-0 sm:first:pl-0">
            <dt className="text-xs text-muted-foreground">{group.label}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold tabular-nums", group.tone)}>
              {group.names.length}
            </dd>
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
              <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground">
                {group.names.join("、") || "无"}
              </p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
