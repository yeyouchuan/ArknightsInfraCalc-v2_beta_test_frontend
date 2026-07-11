export interface TradeProduct {
  trade: { order: "gold" | "originium" };
}

export interface FactoryProduct {
  factory: { recipe: "gold" | "battle_record" | "originium" };
}

export type RoomProduct = TradeProduct | FactoryProduct;

export type RoomKind =
  | "control_center"
  | "trade_post"
  | "factory"
  | "power_plant"
  | "dormitory"
  | "office"
  | "meeting_room"
  | "workshop";

export interface BlueprintRoom {
  id: string;
  kind: RoomKind;
  level: number;
  product?: RoomProduct;
  dorm_beds?: number;
}

export interface BaseBlueprint {
  template: string;
  drone_cap: number;
  scenario: {
    elite_facility_count?: number;
    sui_facility_count?: number;
    dorm_occupant_count?: number;
    base_workforce?: string[];
    initial_global?: {
      monster_cuisine?: number;
    };
  };
  rooms: BlueprintRoom[];
}

export interface PresetDef {
  label: "243" | "153" | "333" | "252" | "342";
  trading: number;
  manufacture: number;
  power: number;
  layout: BaseBlueprint;
}

export interface OperBoxEntry {
  id: string;
  name: string;
  elite: number;
  level: number;
  own: boolean;
  potential: number;
  rarity: number;
}

export interface MaaOperatorSlot {
  name?: string;
  skill?: number;
}

export interface MaaRoom {
  operators: (string | MaaOperatorSlot | null)[];
  product?: string;
  skip?: boolean;
  sort?: boolean;
  autofill?: boolean;
}

export interface MaaRooms {
  trading?: MaaRoom[];
  manufacture?: MaaRoom[];
  power?: MaaRoom[];
  control?: MaaRoom[];
  dormitory?: MaaRoom[];
  meeting?: MaaRoom[];
  hire?: MaaRoom[];
  processing?: MaaRoom[];
}

export interface MaaPlan {
  name: string;
  description?: string;
  rooms: MaaRooms;
  Fiammetta?: { enable: boolean; target?: string };
  drones?: { room: string; index: number; order: string };
}

export interface MaaJson {
  title: string;
  description?: string;
  plans: MaaPlan[];
}

export interface RoomEfficiency {
  trade_score?: number;
  trade_pct?: number;
  trade_skill_pct?: number;
  trade_gold_pct?: number;
  manu_score?: number;
  manu_prod_total?: number;
  manu_prod_skill?: number;
  manu_storage_limit?: number;
  power_score?: number;
  power_skill_pct?: number;
  power_charge_speed_pct?: number;
}

export interface RotationRoomLine extends RoomEfficiency {
  room_id: string;
}

export interface RotationShift {
  index: number;
  duration_hours: number;
  active_teams: string[];
  resting_team: string;
  scores: {
    trade_score: number;
    manu_prod_sum: number;
    power_charge_sum: number;
    room_lines: RotationRoomLine[];
  };
  weighted_trade: number;
  weighted_manu: number;
  weighted_power: number;
}

export interface RotationJson {
  shifts: RotationShift[];
  daily: {
    trade: number | null;
    manu: number | null;
    power: number | null;
  };
}

export interface CliCandidate {
  path: string;
  exists: boolean;
  compatible: boolean;
  reason: string | null;
}

export interface HealthApiResponse {
  ok: boolean;
  apiReady?: boolean;
  cliReady?: boolean;
  cliPath?: string | null;
  serve?: {
    cliPath?: string | null;
    pid?: number | null;
    running: boolean;
    restartCount: number;
  };
  serveError?: string | null;
  candidates?: CliCandidate[];
  coreRoot?: string;
  repoRoot?: string;
  bundledCliRoot?: string;
  bundledDataRoot?: string;
  samplePath?: string | null;
  dataPath?: string | null;
  storageRoot?: string;
  feedbackRoot?: string;
  cliRunRoot?: string;
  error?: string;
}

export type Severity = "ok" | "warn" | "critical";

export interface UserProfileSummary {
  owned: number;
  tier_up_owned: number;
  trade_pool_ready: number;
  manufacture_pool_ready: number;
}

export interface UserProfileComboSnapshot {
  operators: string[];
  final_efficiency: number;
  mechanic_equivalent_efficiency?: number;
}

export interface UserProfileDomainMetric {
  id: string;
  label: string;
  current: UserProfileComboSnapshot;
  baseline: UserProfileComboSnapshot;
  gap_ratio: number;
  severity: Severity;
}

export interface UserProfileRotationSnapshot {
  daily_trade_efficiency: number;
  daily_manufacture_efficiency: number;
  daily_power_efficiency: number;
}

export interface UserProfileAction {
  priority: string;
  kind: string;
  operator: string;
  domain_id: string;
  message: string;
}

export interface UserProfile {
  schema_version: number;
  layout_label: string;
  operbox_label: string;
  baseline_label: string;
  summary: UserProfileSummary;
  domains: UserProfileDomainMetric[];
  rotation: UserProfileRotationSnapshot;
  baseline_rotation: UserProfileRotationSnapshot;
  actions: UserProfileAction[];
  flags: string[];
  narration_hints: string[];
}

export interface DebugBundle {
  version: string;
  startedAt: string;
  durationMs: number;
  cliPath: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  inputSummary: {
    layoutRooms: number | null;
    operboxCount: number;
    sourceName: string | null;
  };
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  profileJson?: UserProfile;
  maaJson?: MaaJson;
  rotationJson?: RotationJson;
  shiftFiles?: string[];
  shiftReadErrors?: string[];
  serveRequest?: unknown;
  serveResponse?: unknown;
  stdout: string;
  stderr: string;
  savedFiles?: {
    runDir?: string;
    layout?: string;
    operbox?: string;
    profile?: string;
    maa?: string;
    rotation?: string;
    shifts?: string;
    debugBundle?: string;
    stdout?: string;
    stderr?: string;
    command?: string;
    serveRequest?: string;
    serveRequestLine?: string;
    serveResponse?: string;
    result?: string;
  };
}

export interface IssueReport {
  type: "room_issue";
  sourceName: string | null;
  room: {
    title: string;
    group: string;
    product?: string;
    operators: string[];
    inferredRule: string;
    efficiency?: RoomEfficiency;
    efficiencyLabel?: string;
  };
  command?: string;
  savedFiles?: {
    feedbackDir?: string;
    issue?: string;
    operbox?: string;
    debugBundle?: string;
  };
  note: string;
}

export interface FeedbackApiResponse {
  success: boolean;
  feedbackId?: string;
  savedAt?: string;
  path?: string;
  relativePath?: string;
  issuePath?: string;
  operboxPath?: string;
  debugBundlePath?: string;
  relativeIssuePath?: string;
  relativeOperboxPath?: string;
  relativeDebugBundlePath?: string;
  error?: string;
}

export interface PlanApiResponse {
  success: boolean;
  startedAt?: string;
  durationMs?: number;
  cliPath?: string;
  command?: string;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  profileJson?: UserProfile;
  maaJson?: MaaJson;
  rotationJson?: RotationJson;
  debugBundle?: DebugBundle;
  runId?: string;
  runPath?: string;
  relativeRunPath?: string;
  resultPath?: string;
  relativeResultPath?: string;
  error?: string;
}
