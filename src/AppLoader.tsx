"use client";

import dynamic from "next/dynamic";

function AppLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background" role="status" aria-live="polite">
      <span className="text-sm text-muted-foreground">正在加载基建计算器…</span>
    </main>
  );
}

const WorkbenchApp = dynamic(() => import("@/App"), {
  loading: AppLoading,
  ssr: false,
});

export default function AppLoader() {
  return <WorkbenchApp />;
}
