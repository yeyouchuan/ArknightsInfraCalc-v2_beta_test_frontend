import type { Metadata } from "next";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: "Arknights InfraCalc 排班验收台",
  description: "明日方舟基建排班 beta 测试验收工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

