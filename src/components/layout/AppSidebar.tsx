"use client";

import { Calculator, GraduationCap, Cloud } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type AppPage = "calculator" | "training" | "skland";

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
                isActive={page === "skland"}
                onClick={() => handlePageChange("skland")}
                tooltip="森空岛状态"
              >
                <Cloud className="size-5" />
                <span>森空岛状态</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
