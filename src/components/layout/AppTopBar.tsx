"use client";

import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SklandAccountSummary, SklandStatusSnapshot } from "@/types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

export function AppTopBar() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm md:hidden [padding-top:env(safe-area-inset-top)]"
      data-app-topbar
    >
      <h1 className="sr-only">可露希尔基建终端</h1>
      <div className="app-content-track flex h-14 items-center">
        <SidebarTrigger className="size-11 shrink-0" />
      </div>
    </header>
  );
}

interface SklandAccountControlProps {
  account?: SklandAccountSummary | null;
  statusSnapshot?: SklandStatusSnapshot | null;
  sessionLoading?: boolean;
  onOpenSkland?: () => void;
}

export function SklandAccountControl({
  account,
  statusSnapshot,
  sessionLoading,
  onOpenSkland,
}: SklandAccountControlProps) {
  if (!CLIENT_SKLAND_ENABLED) return null;

  const selectedRole = account?.roles.find((role) => role.uid === account.selectedUid) ?? account?.roles[0] ?? null;
  const nickname = statusSnapshot?.player.nickname ?? selectedRole?.nickname ?? null;
  const accountLabel = account
    ? `${nickname ?? "已登录账号"}，进入森空岛状态`
    : "登录森空岛";

  if (sessionLoading && !account) {
    return (
      <div
        className="size-9 shrink-0 animate-pulse rounded-r-lg bg-muted motion-reduce:animate-none max-sm:size-11"
        role="status"
        aria-label="正在恢复森空岛会话"
        data-skland-account-loading
      />
    );
  }

  return (
    <Button
      type="button"
      size="icon-lg"
      variant={account ? "default" : "outline"}
      className={`relative -ms-px size-9 overflow-hidden rounded-l-none rounded-r-lg max-sm:size-11 ${account ? "max-sm:border-transparent max-sm:bg-transparent" : ""}`}
      onClick={onOpenSkland}
      aria-label={accountLabel}
      title={nickname ?? "登录森空岛"}
      data-skland-account-control
    >
      {account ? (
        <span
          className="grid size-full place-items-center overflow-hidden text-sm font-semibold"
          aria-hidden="true"
          data-skland-account-avatar
        >
          {statusSnapshot?.player.avatarUrl ? (
            <img
              src={statusSnapshot.player.avatarUrl}
              alt=""
              width={44}
              height={44}
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : nickname?.slice(0, 1) ?? "森"}
        </span>
      ) : <UserPlus aria-hidden="true" />}
    </Button>
  );
}
