import { ArrowUpRight, CircleAlert, ClipboardCheck, GraduationCap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Button } from "@/components/ui/button";
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


export function TrainingAdvice({ operbox, layout, profile, onOpenCalculator }: TrainingAdviceProps) {
  const shouldReduceMotion = useReducedMotion();
  const entries = operbox ?? [];
  const ownedByName = new Map(entries.map((entry) => [entry.name, entry]));
  const roomCounts = countRooms(layout);
  const issues = contractIssues(layout, operbox);
  const actions = profile?.actions ?? [];
  const ownedTotal = entries.filter((entry) => entry.own).length;
  const eliteTotal = entries.filter((entry) => entry.own && entry.elite >= 2).length;

  return (
    <div className="flex w-full flex-col gap-5 pt-5" data-training-page>
      <section className="min-w-0" aria-label="训练建议概览">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
          <h1 className="truncate text-[21px] font-medium leading-none text-[#313131]">训练建议</h1>
          <span className="font-number text-xs text-[#313131]/52">{actions.length}</span>
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
                <span><span className="font-number">{roomCounts.trade}</span> 贸易</span>
                <span><span className="font-number">{roomCounts.factory}</span> 制造</span>
                <span><span className="font-number">{roomCounts.power}</span> 发电</span>
                <span><span className="font-number">{roomCounts.dormitory}</span> 宿舍</span>
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
          <span className="font-number text-xs text-[#313131]/52">{actions.length}</span>
        </div>
        {actions.length ? (
          <div className="grid min-w-0 gap-3" data-training-advice-list>
            {actions.map((action, index) => (
              <RecommendationCard key={actionKey(action, index)} action={action} entry={ownedByName.get(action.operator)} index={index} />
            ))}
          </div>
        ) : (
          <InfraTechnicalCard
            group="training"
            className="min-h-[248px]"
            dataSlot="training-empty"
            showEmblem={false}
          >
            <div className="grid min-h-[216px] gap-6 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center">
              <motion.div className="max-w-xl" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.38, ease: [0.23, 1, 0.32, 1] }}>
                <div className="flex items-center gap-2 text-[var(--room-accent)]"><ArrowUpRight className="size-6" aria-hidden="true" /><span className="font-number text-[10px] font-semibold uppercase tracking-[0.16em]">ADVICE QUEUE · 00</span></div>
                <h3 className="mt-4 text-xl font-semibold">
                  {profile ? "本次排班暂无培养建议" : "尚无培养建议"}
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-white/62">
                  {profile
                    ? "当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。"
                    : "先导入干员数据、确认基建布局并生成一次排班。"}
                </p>
                <Button type="button" className="mt-4 h-9 bg-white text-[#272a2b] hover:bg-white/90 max-sm:h-11" onClick={onOpenCalculator}>
                  {profile ? "查看当前排班" : "前往生成排班"}
                </Button>
              </motion.div>
              <motion.div className="hidden border-y border-white/12 py-3 sm:block" aria-hidden="true" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.38, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.23, 1, 0.32, 1] }}>
                {["干员练度扫描", "设施领域分析", "优先级队列"].map((label, index) => <div key={label} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/8 py-2.5 last:border-0"><span className="font-number text-[10px] text-white/35">0{index + 1}</span><span className="text-xs text-white/65">{label}</span><span className="font-number text-[10px] text-emerald-300/80">CLEAR</span></div>)}
              </motion.div>
            </div>
          </InfraTechnicalCard>
        )}
      </section>
    </div>
  );
}
