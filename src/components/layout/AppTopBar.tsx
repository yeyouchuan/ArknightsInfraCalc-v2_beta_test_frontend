"use client";

import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CLIENT_SKLAND_ENABLED } from "@/client-features";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SklandAccountSummary, SklandStatusSnapshot } from "@/types";

interface AppTopBarProps {
  account?: SklandAccountSummary | null;
  statusSnapshot?: SklandStatusSnapshot | null;
  sessionLoading?: boolean;
  onOpenSkland?: () => void;
}

export function AppTopBar({ account, statusSnapshot, sessionLoading, onOpenSkland }: AppTopBarProps) {
  const selectedRole = account?.roles.find((role) => role.uid === account.selectedUid) ?? account?.roles[0] ?? null;
  const nickname = statusSnapshot?.player.nickname ?? selectedRole?.nickname ?? null;
  const accountLabel = account
    ? `${nickname ?? "已登录账号"}，进入森空岛状态`
    : "登录森空岛";

  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm md:border-b-0 md:bg-transparent md:backdrop-blur-none [padding-top:env(safe-area-inset-top)]"
      data-app-topbar
    >
      <h1 className="sr-only">可露希尔基建终端</h1>
      <div className="app-content-track flex h-[65px] items-center">
        <SidebarTrigger className="size-11 shrink-0 md:hidden" />
        {CLIENT_SKLAND_ENABLED ? <div className="ms-auto flex h-11 min-w-11 items-center justify-end">
          {sessionLoading && !account ? (
            <div
              className="h-11 w-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none sm:w-32"
              role="status"
              aria-label="正在恢复森空岛会话"
              data-skland-topbar-loading
            />
          ) : account ? (
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm ring-1 ring-black/10 transition-[box-shadow,scale] duration-150 ease-out hover:shadow-md active:scale-[0.96] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={onOpenSkland}
              aria-label={accountLabel}
              title={nickname ?? "已登录森空岛"}
              data-skland-topbar-account
            >
              <span
                className="grid size-full place-items-center overflow-hidden"
                aria-hidden="true"
                data-skland-topbar-avatar
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
            </button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-3.5 shadow-xs"
              onClick={onOpenSkland}
              aria-label={accountLabel}
              data-skland-topbar-account
            >
              <LogIn aria-hidden="true" />
              登录森空岛
            </Button>
          )}
        </div> : null}
      </div>
    </header>
  );
}
