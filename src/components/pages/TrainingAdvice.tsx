import { ArrowUpRight, CircleAlert, ClipboardCheck, GraduationCap } from "lucide-react";

import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { Button } from "@/components/ui/button";
import { operatorPortraitFor } from "@/operatorPortraits";
import type { BaseBlueprint, OperBoxEntry, UserProfile, UserProfileAction } from "@/types";

type TrainingAdviceProps = {
  operbox?: OperBoxEntry[] | null;
  layout?: BaseBlueprint | null;
  profile?: UserProfile | null;
  onOpenCalculator: () => void;
};

function countRooms(layout: BaseBlueprint | null | undefined) {
  const rooms = layout?.rooms ?? [];
  return {
    total: rooms.length,
    trade: rooms.filter((room) => room.kind === "trade_post").length,
    factory: rooms.filter((room) => room.kind === "factory").length,
    power: rooms.filter((room) => room.kind === "power_plant").length,
    dormitory: rooms.filter((room) => room.kind === "dormitory").length,
  };
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

function contractIssues(layout: BaseBlueprint | null | undefined, operbox: OperBoxEntry[] | null | undefined) {
  const issues: string[] = [];
  const rooms = layout?.rooms ?? [];
  const entries = operbox ?? [];

  if (!rooms.length) issues.push("尚未配置基建设施");
  if (!entries.length) issues.push("尚未导入干员数据");
  if (rooms.length > 64) issues.push("基建设施不能超过 64 间房");
  if (entries.length > 1000) issues.push("干员数据不能超过 1000 条");
  if (rooms.some((room) => !room.id.trim())) issues.push("存在空房间 ID");
  if (entries.some((entry) => !entry.id.trim() || !entry.name.trim())) issues.push("存在空干员 ID 或名称");

  const duplicateRoomIds = duplicateValues(rooms.map((room) => room.id));
  if (duplicateRoomIds.length) issues.push(`房间 ID 重复：${duplicateRoomIds.join("、")}`);

  const duplicateOperatorIds = duplicateValues(entries.map((entry) => entry.id));
  if (duplicateOperatorIds.length) issues.push(`干员 ID 重复：${duplicateOperatorIds.join("、")}`);

  const duplicateOperatorNames = duplicateValues(entries.map((entry) => entry.name));
  if (duplicateOperatorNames.length) issues.push(`干员名称重复：${duplicateOperatorNames.join("、")}`);

  return issues;
}

function actionKey(action: UserProfileAction, index: number) {
  return `${action.domain_id}-${action.kind}-${action.operator}-${index}`;
}

function actionDomainLabel(value: string): string {
  const labels: Record<string, string> = {
    trade: "贸易站",
    trading: "贸易站",
    manufacture: "制造站",
    manu: "制造站",
    power: "发电站",
    control: "控制中枢",
    general: "综合",
  };
  return labels[value.toLowerCase()] ?? "综合";
}

function actionDomainGroup(value: string): string {
  const groups: Record<string, string> = {
    trade: "trading",
    trading: "trading",
    manufacture: "manufacture",
    manu: "manufacture",
    power: "power",
    control: "control",
    general: "training",
  };
  return groups[value.toLowerCase()] ?? "training";
}

function actionKindLabel(value: string): string {
  const labels: Record<string, string> = {
    promote: "培养优先级",
    promote_tier_up: "练度提升",
    acquire: "获取建议",
    replace: "阵容调整",
    advice: "培养建议",
  };
  return labels[value.toLowerCase()] ?? "培养建议";
}

function ActionCard({
  action,
  entry,
}: {
  action: UserProfileAction;
  entry?: OperBoxEntry;
}) {
  const portrait = operatorPortraitFor(action.operator);
  const currentElite = action.current_elite ?? entry?.elite;
  const state = !entry?.own
    ? "未拥有"
    : action.tier_up_requirement && currentElite !== undefined
      ? `当前 精${currentElite} → 目标 ${action.tier_up_requirement}`
      : entry.elite >= 2
        ? "已精二"
        : "待培养";

  return (
    <InfraTechnicalCard
      group={actionDomainGroup(action.domain_id)}
      className="min-w-0"
      dataSlot="training-advice-card"
      showEmblem={false}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center">
        <div className="relative size-[88px] overflow-hidden bg-[#3C3C3C] outline outline-1 -outline-offset-1 outline-white/12">
          {portrait ? (
            <img
              src={portrait}
              alt={action.operator}
              width={88}
              height={88}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center px-2 text-center text-xs font-semibold">{action.operator || "未知干员"}</div>
          )}
          <div className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-center text-[11px] font-semibold">
            {action.operator || "未指定干员"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="font-medium text-[var(--room-accent)]">{actionDomainLabel(action.domain_id)}</span>
            <span aria-hidden="true">·</span>
            <span>{actionKindLabel(action.kind)}</span>
          </div>
          <p className="mt-2 max-w-[72ch] text-pretty text-sm leading-6 text-white/82">{action.message}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
          <span className="border border-[var(--room-accent)]/45 bg-black/18 px-2.5 py-1 text-xs font-semibold text-[var(--room-accent)]">
            {action.priority || "未分级"}
          </span>
          <span className="border border-white/15 bg-white/7 px-2.5 py-1 text-xs text-white/70">{state}</span>
        </div>
      </div>
    </InfraTechnicalCard>
  );
}

export function TrainingAdvice({ operbox, layout, profile, onOpenCalculator }: TrainingAdviceProps) {
  const entries = operbox ?? [];
  const ownedByName = new Map(entries.map((entry) => [entry.name, entry]));
  const roomCounts = countRooms(layout);
  const issues = contractIssues(layout, operbox);
  const actions = profile?.actions ?? [];
  const ownedTotal = entries.filter((entry) => entry.own).length;
  const eliteTotal = entries.filter((entry) => entry.own && entry.elite >= 2).length;

  return (
    <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-5">
      <section className="min-w-0" aria-label="训练建议概览">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
          <h1 className="truncate text-[21px] font-medium leading-none text-[#313131]">训练建议</h1>
          <span className="text-xs text-[#313131]/52">{actions.length}</span>
        </div>
        <InfraTechnicalCard group="manufacture" dataSlot="training-summary" showEmblem={false}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(28rem,0.8fr)] lg:items-end">
            <div>
              <InfraTechnicalHeading icon={<GraduationCap className="size-4" aria-hidden="true" />}>
                最近一次排班
              </InfraTechnicalHeading>
              <h2 className="mt-4 text-[23px] font-medium leading-tight tracking-[-0.02em]">
                根据最近排班整理的培养方向
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
              {[
                ["布局", layout?.template || "—"],
                ["房间", roomCounts.total || "—"],
                ["已拥有", entries.length ? ownedTotal : "—"],
                ["已精二", entries.length ? eliteTotal : "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-black/24 px-3 py-3">
                  <span className="text-[10px] text-white/48">{label}</span>
                  <strong className="mt-1 block truncate text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                    {value}
                  </strong>
                </div>
              ))}
              <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-black/24 px-3 py-2 text-xs text-white/65 sm:col-span-4">
                <span>设施</span>
                <span>{roomCounts.trade} 贸易</span>
                <span>{roomCounts.factory} 制造</span>
                <span>{roomCounts.power} 发电</span>
                <span>{roomCounts.dormitory} 宿舍</span>
              </div>
            </div>
          </div>
        </InfraTechnicalCard>
      </section>

      {issues.length ? (
        <InfraTechnicalCard group="manufacture" dataSlot="training-data-check" showEmblem={false}>
          <div className="flex gap-3 text-sm" aria-label="数据检查问题">
            <CircleAlert
              className="mt-0.5 size-5 shrink-0 text-[var(--room-accent)]"
              aria-hidden="true"
            />
            <div>
              <strong className="text-[var(--room-accent)]">还需要补充以下信息</strong>
              <ul className="mt-2 grid gap-1 text-white/72">
                {issues.map((issue) => <li key={issue}>• {issue}</li>)}
              </ul>
            </div>
          </div>
        </InfraTechnicalCard>
      ) : (
        <InfraTechnicalCard group="power" dataSlot="training-data-check" showEmblem={false}>
          <div className="flex gap-3 text-sm" aria-label="数据检查">
            <ClipboardCheck
              className="mt-0.5 size-5 shrink-0 text-[var(--room-accent)]"
              aria-hidden="true"
            />
            <p className="text-white/76">当前基建设施与干员数据已通过基础检查，可以生成排班。</p>
          </div>
        </InfraTechnicalCard>
      )}

      <section className="min-w-0" aria-label="培养建议">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-1.5 shrink-0 bg-[#29BDF5]" aria-hidden="true" />
          <h2 className="truncate text-[21px] font-medium leading-none text-[#313131]">培养建议</h2>
          <span className="text-xs text-[#313131]/52">{actions.length}</span>
        </div>
        {actions.length ? (
          <div className="grid min-w-0 gap-3" data-training-advice-list>
            {actions.map((action, index) => (
              <ActionCard key={actionKey(action, index)} action={action} entry={ownedByName.get(action.operator)} />
            ))}
          </div>
        ) : (
          <InfraTechnicalCard
            group="training"
            className="min-h-[220px]"
            dataSlot="training-empty"
            showEmblem={false}
          >
            <div className="grid min-h-[188px] place-items-center text-center">
              <div className="max-w-xl">
                <ArrowUpRight
                  className="mx-auto size-8 text-[var(--room-accent)]"
                  aria-hidden="true"
                />
                <h3 className="mt-3 text-lg font-semibold">
                  {profile ? "本次排班暂无培养建议" : "尚无培养建议"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/62">
                  {profile
                    ? "当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。"
                    : "先导入干员数据、确认基建布局并生成一次排班。"}
                </p>
                <Button type="button" className="mt-4 h-9 bg-white text-[#272a2b] hover:bg-white/90 max-sm:h-11" onClick={onOpenCalculator}>
                  {profile ? "查看当前排班" : "前往生成排班"}
                </Button>
              </div>
            </div>
          </InfraTechnicalCard>
        )}
      </section>
    </div>
  );
}
