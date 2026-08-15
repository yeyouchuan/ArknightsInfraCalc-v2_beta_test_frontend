"use client";

import { useMemo, useState } from "react";
import { BookOpenText, Search } from "lucide-react";

import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { LoadMore } from "@/components/interior/load-more";
import { Input } from "@/components/ui/input";
import {
  OPERATOR_CATALOG,
  PROFESSION_LABELS,
  operatorBuildingSkillsFor,
  type BuildingSkillPresentation,
  type OperatorAssetRecord,
} from "@/operatorPortraits";

const PAGE_SIZE = 24;

type SearchableOperator = {
  operator: OperatorAssetRecord;
  skills: BuildingSkillPresentation[];
  searchText: string;
};

const SEARCHABLE_OPERATORS: SearchableOperator[] = OPERATOR_CATALOG
  .map((operator) => {
    const skills = operatorBuildingSkillsFor(operator);
    return {
      operator,
      skills,
      searchText: [
        operator.name,
        PROFESSION_LABELS[operator.profession] ?? "",
        ...skills.flatMap((skill) => [skill.name, skill.description]),
      ].join(" ").toLocaleLowerCase("zh-CN"),
    };
  })
  .filter(({ skills }) => skills.length > 0)
  .sort((a, b) => b.operator.rarity - a.operator.rarity || a.operator.name.localeCompare(b.operator.name, "zh-CN"));

function unlockLabel(skill: BuildingSkillPresentation): string {
  if (skill.elite <= 0) return skill.level <= 1 ? "初始解锁" : `等级 ${skill.level}`;
  return `精英 ${skill.elite} · 等级 ${skill.level}`;
}

function facilityLabel(skillId: string): string {
  if (skillId.startsWith("trade_")) return "贸易站";
  if (skillId.startsWith("manu_")) return "制造站";
  if (skillId.startsWith("power_")) return "发电站";
  if (skillId.startsWith("control_")) return "控制中枢";
  if (skillId.startsWith("dorm_")) return "宿舍";
  if (skillId.startsWith("meet_")) return "会客室";
  if (skillId.startsWith("hire_")) return "办公室";
  if (skillId.startsWith("workshop_")) return "加工站";
  if (skillId.startsWith("training_")) return "训练室";
  return "基建设施";
}

function OperatorSkillCard({ item }: { item: SearchableOperator }) {
  const { operator, skills } = item;

  return (
    <InfraTechnicalCard group="control" dataSlot="skill-lookup-card" showEmblem={false} className="min-w-0">
      <div className="grid min-w-0 gap-4 sm:grid-cols-[88px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative size-[88px] overflow-hidden bg-[#3c3c3c] outline outline-1 -outline-offset-1 outline-white/15">
            <img
              src={operator.portrait}
              alt={operator.name}
              width={88}
              height={88}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
          <strong className="mt-2 block truncate text-sm text-white">{operator.name}</strong>
          <span className="mt-0.5 block text-xs text-white/55">
            {operator.rarity} 星 · {PROFESSION_LABELS[operator.profession] ?? "未知职业"}
          </span>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {skills.map((skill) => (
            <div key={`${operator.id}-${skill.index}`} className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
              <img
                src={skill.icon}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="size-11 object-contain"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="text-sm text-[var(--room-accent)]">{skill.name}</strong>
                  <span className="text-[11px] text-white/48">
                    {facilityLabel(skill.id)} · {unlockLabel(skill)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-white/72">{skill.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </InfraTechnicalCard>
  );
}

export function SkillLookup() {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = useMemo(
    () => normalizedQuery
      ? SEARCHABLE_OPERATORS.filter((item) => item.searchText.includes(normalizedQuery))
      : SEARCHABLE_OPERATORS,
    [normalizedQuery],
  );
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visible.length < filtered.length;

  function handleQueryChange(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <section className="min-w-0" aria-labelledby="skill-lookup-title">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-1.5 shrink-0 bg-[#29BDF5]" aria-hidden="true" />
          <h1 id="skill-lookup-title" className="truncate text-[21px] font-medium leading-none text-[#313131]">技能查询</h1>
          <span className="font-number text-xs text-[#313131]/52">{filtered.length}</span>
        </div>

        <InfraTechnicalCard group="control" dataSlot="skill-lookup-search" showEmblem={false}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.55fr)] lg:items-end">
            <div>
              <InfraTechnicalHeading icon={<BookOpenText className="size-4" aria-hidden="true" />}>
                基建技能目录
              </InfraTechnicalHeading>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68">
                按干员名、技能名或技能效果检索。结果会分批显示，减少长列表卡顿。
              </p>
            </div>
            <div>
              <label htmlFor="skill-lookup-query" className="mb-1.5 block text-xs font-medium text-white/68">
                搜索干员或技能
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/45" aria-hidden="true" />
                <Input
                  id="skill-lookup-query"
                  type="search"
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="例如：巫恋、订单效率、会客室"
                  autoComplete="off"
                  className="h-10 border-white/18 bg-black/20 pl-9 text-white placeholder:text-white/38 max-sm:h-11"
                />
              </div>
            </div>
          </div>
        </InfraTechnicalCard>
      </section>

      <section className="min-w-0" aria-label="技能查询结果">
        {visible.length ? (
          <>
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              {visible.map((item) => <OperatorSkillCard key={item.operator.id} item={item} />)}
            </div>
            <LoadMore
              className="mt-4 min-h-11"
              hasMore={hasMore}
              onLoad={() => {
                setVisibleCount((current) => Math.min(current + PAGE_SIZE, filtered.length));
                return visibleCount + PAGE_SIZE < filtered.length;
              }}
              labels={{
                idle: `继续显示（剩余 ${filtered.length - visible.length}）`,
                loading: "正在加载",
                error: "加载失败，点击重试",
                end: `已显示全部 ${filtered.length} 位干员`,
              }}
            />
          </>
        ) : (
          <InfraTechnicalCard group="control" dataSlot="skill-lookup-empty" showEmblem={false} className="min-h-48">
            <div className="grid min-h-40 place-items-center px-4 text-center">
              <div>
                <Search className="mx-auto size-7 text-[var(--room-accent)]" aria-hidden="true" />
                <h2 className="mt-3 text-base font-semibold">没有匹配结果</h2>
                <p className="mt-1 text-sm text-white/60">可尝试干员简称、设施名称或“效率”“心情”等效果词。</p>
              </div>
            </div>
          </InfraTechnicalCard>
        )}
      </section>
    </div>
  );
}
