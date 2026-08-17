"use client";

import { Calculator, Cloud, GraduationCap, Search } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";
export type AppPage = "calculator" | "training" | "skland" | "skill-query";

interface AppSidebarProps {
  page: AppPage;
  onPageChange: (page: AppPage) => void;
}

export function AppSidebar({ page, onPageChange }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  function handlePageChange(nextPage: AppPage) {
    onPageChange(nextPage);
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-[65px] flex-row items-center justify-end border-b border-sidebar-border px-2 group-data-[collapsible=icon]:justify-center">
        <SidebarTrigger className="h-9 w-9" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "calculator"}
                onClick={() => handlePageChange("calculator")}
                tooltip="基建计算器"
              >
                <Calculator className="size-5" />
                <span>基建计算器</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "training"}
                onClick={() => handlePageChange("training")}
                tooltip="练卡建议"
              >
                <GraduationCap className="size-5" />
                <span>练卡建议</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "skill-query"}
                onClick={() => handlePageChange("skill-query")}
                tooltip="技能查询"
              >
                <Search className="size-5" />
                <span>技能查询</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {CLIENT_SKLAND_ENABLED ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === "skland"}
                  onClick={() => handlePageChange("skland")}
                  tooltip="森空岛状态"
                >
                  <Cloud className="size-5" />
                  <span>森空岛状态</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
