"use client";

import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SklandSnapshot } from "@/types";

interface AppTopBarProps {
  snapshot: SklandSnapshot | null;
  sessionLoading: boolean;
  onOpenSkland: () => void;
}

export function AppTopBar({ snapshot, sessionLoading, onOpenSkland }: AppTopBarProps) {
  const accountLabel = snapshot
    ? `${snapshot.player.nickname}，进入森空岛状态`
    : "登录森空岛";

  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm md:border-b-0 md:bg-transparent md:backdrop-blur-none [padding-top:env(safe-area-inset-top)]"
      data-app-topbar
    >
      <h1 className="sr-only">明日方舟基建排班助手</h1>
      <div className="app-content-track flex h-[65px] items-center">
        <SidebarTrigger className="size-11 shrink-0 md:hidden" />
        <div className="ms-auto flex h-11 min-w-11 items-center justify-end">
          {sessionLoading && !snapshot ? (
            <div
              className="h-11 w-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none sm:w-32"
              role="status"
              aria-label="正在恢复森空岛会话"
              data-skland-topbar-loading
            />
          ) : snapshot ? (
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm ring-1 ring-black/10 transition-[box-shadow,scale] duration-150 ease-out hover:shadow-md active:scale-[0.96] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={onOpenSkland}
              aria-label={accountLabel}
              title={snapshot.player.nickname}
              data-skland-topbar-account
            >
              <span
                className="grid size-full place-items-center overflow-hidden"
                aria-hidden="true"
                data-skland-topbar-avatar
              >
                {snapshot.player.avatarUrl ? (
                  <img
                    src={snapshot.player.avatarUrl}
                    alt=""
                    width={44}
                    height={44}
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                ) : snapshot.player.nickname.slice(0, 1)}
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
        </div>
      </div>
    </header>
  );
}
