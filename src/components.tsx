import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Download,
  FileWarning,
  Loader2,
  Play,
  Save,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, ReactNode } from "react";
import {
  FACTORY_RECIPE_OPTIONS,
  FactoryRecipe,
  TRADE_ORDER_OPTIONS,
  TradeOrder,
  factoryRecipeFor,
  productLabel,
  roomKindLabel,
  tradeOrderFor,
} from "./blueprint";
import { RoomRow } from "./schedule";
import {
  BaseBlueprint,
  FeedbackApiResponse,
  IssueReport,
  MaaJson,
  OperBoxEntry,
  PlanApiResponse,
  PresetDef,
} from "./types";
import { countElite2, countOwned, countSixStar } from "./operbox";

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function FileDrop({
  fileName,
  onFile,
}: {
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.currentTarget.value = "";
  }

  return (
    <label className="file-drop">
      <Upload size={20} />
      <span>{fileName ?? "上传练度 JSON / XLSX"}</span>
      <small>支持前端导出的 operbox.json，也支持一图流 xlsx</small>
      <input type="file" accept=".json,.xlsx,.xls" onChange={handleChange} />
    </label>
  );
}

export function PresetSelector({
  presets,
  selected,
  onSelect,
}: {
  presets: PresetDef[];
  selected: PresetDef;
  onSelect: (preset: PresetDef) => void;
}) {
  return (
    <div className="preset-grid">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className={`preset ${selected.label === preset.label ? "active" : ""}`}
          onClick={() => onSelect(preset)}
        >
          <strong>{preset.label}</strong>
          <span>
            {preset.trading} 贸 / {preset.manufacture} 制 / {preset.power} 电
          </span>
        </button>
      ))}
    </div>
  );
}

export function LayoutEditor({
  layout,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  layout: BaseBlueprint;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  return (
    <div className="layout-room-list">
      {layout.rooms.map((room) => {
        const isTrade = room.kind === "trade_post";
        const isFactory = room.kind === "factory";
        const activeOrder = isTrade ? tradeOrderFor(room) : null;
        const activeRecipe = isFactory ? factoryRecipeFor(room) : null;
        const product = productLabel(room);

        return (
          <article
            key={room.id}
            className={`layout-room ${isTrade ? "trade-room" : ""} ${isFactory ? "factory-room" : ""}`}
          >
            <div className="layout-room-main">
              <div>
                <strong>{room.id}</strong>
                <span>{roomKindLabel(room.kind)}</span>
              </div>
              <em>{room.level} 级</em>
            </div>

            {isTrade ? (
              <div className="recipe-segment trade-segment" aria-label={`${room.id} 订单`}>
                {TRADE_ORDER_OPTIONS.map((option) => (
                  <button
                    key={option.order}
                    type="button"
                    className={activeOrder === option.order ? "active" : ""}
                    onClick={() => onTradeOrderChange(room.id, option.order)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : isFactory ? (
              <div className="recipe-segment" aria-label={`${room.id} 配方`}>
                {FACTORY_RECIPE_OPTIONS.map((option) => (
                  <button
                    key={option.recipe}
                    type="button"
                    className={activeRecipe === option.recipe ? "active" : ""}
                    onClick={() => onFactoryRecipeChange(room.id, option.recipe)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : product ? (
              <div className="layout-product">{product}</div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function AccountStats({ operbox }: { operbox: OperBoxEntry[] | null }) {
  return (
    <div className="stats-grid">
      <div>
        <span>拥有干员</span>
        <strong>{countOwned(operbox)}</strong>
      </div>
      <div>
        <span>精二干员</span>
        <strong>{countElite2(operbox)}</strong>
      </div>
      <div>
        <span>六星干员</span>
        <strong>{countSixStar(operbox)}</strong>
      </div>
    </div>
  );
}

export function StatusBar({
  loading,
  result,
  error,
  cliPath,
}: {
  loading: boolean;
  result: PlanApiResponse | null;
  error: string | null;
  cliPath: string | null;
}) {
  if (loading) {
    return (
      <div className="status running">
        <Loader2 className="spin" size={18} />
        <span>正在通过 infra-cli serve 排班</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="status error">
        <AlertTriangle size={18} />
        <span>{error}</span>
      </div>
    );
  }
  if (result?.success) {
    return (
      <div className="status ok">
        <CheckCircle2 size={18} />
        <span>运行完成：{result.durationMs ?? "?"}ms</span>
      </div>
    );
  }
  return (
    <div className="status idle">
      <CircleHelp size={18} />
      <span>{cliPath ? `CLI: ${cliPath}` : "等待连接本地 CLI 服务"}</span>
    </div>
  );
}

export function RunButton({
  canRun,
  loading,
  onRun,
}: {
  canRun: boolean;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <Button onClick={onRun} disabled={!canRun || loading}>
      {loading ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
      {loading ? "计算中" : "生成排班"}
    </Button>
  );
}

export function ShiftTabs({
  maaJson,
  active,
  onChange,
}: {
  maaJson?: MaaJson;
  active: number;
  onChange: (index: number) => void;
}) {
  const labels = ["α 12h", "β 6h", "γ 6h"];
  const plans = maaJson?.plans ?? [];

  return (
    <div className="shift-tabs">
      {plans.length === 0 ? (
        <button type="button" disabled>
          等待结果
        </button>
      ) : (
        plans.map((plan, index) => (
          <button
            key={`${plan.name}-${index}`}
            type="button"
            className={active === index ? "active" : ""}
            onClick={() => onChange(index)}
          >
            {labels[index] ?? plan.name ?? `班次 ${index + 1}`}
          </button>
        ))
      )}
    </div>
  );
}

export function ScheduleBoard({
  rows,
  layout,
  onIssue,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: {
  rows: RoomRow[];
  layout: BaseBlueprint;
  onIssue: (row: RoomRow) => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}) {
  if (rows.length === 0) {
    return <div className="empty board-empty">没有可展示的布局房间。</div>;
  }

  const rowGroups = rows.reduce<{ label: string; rows: RoomRow[] }[]>((groups, row) => {
    const group = groups.find((item) => item.label === row.groupLabel);
    if (group) {
      group.rows.push(row);
    } else {
      groups.push({ label: row.groupLabel, rows: [row] });
    }
    return groups;
  }, []);

  return (
    <div className="schedule-grid">
      {rowGroups.map((group) => (
        <section key={group.label} className="schedule-row" aria-label={group.label}>
          {group.rows.map((row) => {
            const layoutRoom = layout.rooms.find((room) => room.id === row.roomId);
            const isTrade = layoutRoom?.kind === "trade_post";
            const isFactory = layoutRoom?.kind === "factory";
            const activeOrder = isTrade ? tradeOrderFor(layoutRoom) : null;
            const activeRecipe = isFactory ? factoryRecipeFor(layoutRoom) : null;

            return (
              <article key={row.key} className={`room-card ${row.group} ${row.suspicious ? "suspicious" : ""}`}>
                <header>
                  <span>
                    {row.title}
                    {row.level ? <small>{row.level} 级</small> : null}
                  </span>
                  <div>
                    {row.product ? <em>{row.product}</em> : null}
                  </div>
                </header>

                {isTrade ? (
                  <div className="room-product-controls trade-segment" aria-label={`${row.title} 订单`}>
                    {TRADE_ORDER_OPTIONS.map((option) => (
                      <button
                        key={option.order}
                        type="button"
                        className={activeOrder === option.order ? "active" : ""}
                        onClick={() => onTradeOrderChange(row.roomId, option.order)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : isFactory ? (
                  <div className="room-product-controls" aria-label={`${row.title} 配方`}>
                    {FACTORY_RECIPE_OPTIONS.map((option) => (
                      <button
                        key={option.recipe}
                        type="button"
                        className={activeRecipe === option.recipe ? "active" : ""}
                        onClick={() => onFactoryRecipeChange(row.roomId, option.recipe)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="op-list">
                  {row.operators.length > 0 ? (
                    row.operators.map((operator) => <b key={operator}>{operator}</b>)
                  ) : (
                    <i>空置</i>
                  )}
                </div>
                {row.efficiencyLabel ? <div className="room-efficiency">{row.efficiencyLabel}</div> : null}
                <footer>
                  <span>{row.rule}</span>
                  <button type="button" onClick={() => onIssue(row)}>
                    <FileWarning size={14} />
                    标记问题
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function IssueNoteModal({
  open,
  row,
  note,
  saving,
  onNoteChange,
  onSave,
  onCancel,
}: {
  open: boolean;
  row: RoomRow | null;
  note: string;
  saving: boolean;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!open || !row) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>输入 note</span>
            <strong>{row.title}</strong>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <p className="modal-help">写下为什么要标记这个房间。</p>
        <textarea
          autoFocus
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="例如：这组应该换成可露希尔 / 当前站位有误。"
        />
        <div className="modal-actions">
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onSave} disabled={!note.trim() || saving}>
            {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
            {saving ? "保存中" : "保存到服务器"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IssuePanel({
  issue,
  report,
  feedback,
  feedbackError,
}: {
  issue: { row: RoomRow; note: string } | null;
  report: IssueReport | null;
  feedback: FeedbackApiResponse | null;
  feedbackError: string | null;
}) {
  if (!issue || !report) {
    return <div className="empty">点击房间里的“标记问题”，这里会生成反馈上下文。</div>;
  }

  const savedReport: IssueReport = feedback?.success
    ? {
        ...report,
        savedFiles: {
          feedbackDir: feedback.relativePath ?? feedback.path,
          issue: feedback.relativeIssuePath ?? feedback.issuePath,
          operbox: feedback.relativeOperboxPath ?? feedback.operboxPath,
          debugBundle: feedback.relativeDebugBundlePath ?? feedback.debugBundlePath,
        },
      }
    : report;

  return (
    <div className="issue-box">
      <strong>{issue.row.title}</strong>
      <p>{issue.row.operators.join(" / ") || "空置"}</p>
      <p>{issue.note}</p>
      {feedback?.success ? (
        <div className="feedback-save ok">
          <CheckCircle2 size={14} />
          <span>已保存 box：{feedback.relativeOperboxPath ?? feedback.operboxPath ?? feedback.relativePath ?? feedback.feedbackId}</span>
        </div>
      ) : null}
      {feedbackError ? (
        <div className="feedback-save error">
          <AlertTriangle size={14} />
          <span>{feedbackError}</span>
        </div>
      ) : null}
      <textarea readOnly value={JSON.stringify(savedReport, null, 2)} />
    </div>
  );
}

export function DebugActions({
  result,
  onDownloadMaa,
  onDownloadBundle,
  onCopyCommand,
}: {
  result: PlanApiResponse | null;
  onDownloadMaa: () => void;
  onDownloadBundle: () => void;
  onCopyCommand: () => void;
}) {
  return (
    <div className="debug-actions">
      <Button variant="ghost" disabled={!result?.maaJson} onClick={onDownloadMaa}>
        <Download size={16} />
        下载 MAA
      </Button>
      <Button variant="ghost" disabled={!result?.debugBundle} onClick={onDownloadBundle}>
        <Download size={16} />
        下载调试包
      </Button>
      <Button variant="ghost" disabled={!result?.command} onClick={onCopyCommand}>
        复制 CLI 命令
      </Button>
    </div>
  );
}
