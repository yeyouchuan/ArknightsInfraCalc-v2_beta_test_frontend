export interface TradeProduct {
  trade: { order: "gold" | "originium" };
}

export interface FactoryProduct {
  factory: { recipe: "all" | "gold" | "battle_record" | "originium" };
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
  | "workshop"
  | "training_room";

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
  Fiammetta?: { enable: boolean; target?: string | string[]; order?: string };
  drones?: { enable?: boolean; room: string; index: number; order: string };
}

export interface MaaJson {
  author?: string;
  id?: string | number;
  title: string;
  description?: string;
  planTimes?: string | number;
  plans: MaaPlan[];
  scheduleType?: {
    planTimes: number;
    trading?: number;
    manufacture?: number;
    power?: number;
    dormitory?: number;
  };
}

export interface RoomEfficiency {
  trade_score?: number;
  trade_pct?: number;
  trade_skill_pct?: number;
  trade_display_pct?: number;
  trade_gold_pct?: number;
  manu_score?: number;
  manu_prod_total?: number;
  manu_prod_skill?: number;
  manu_display_pct?: number;
  manu_storage_limit?: number;
  power_score?: number;
  power_skill_pct?: number;
  power_display_pct?: number;
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
  profile: RotationProfile;
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
    protocolMode?: "plan.compute" | "legacy";
    planCompute?: {
      supported: boolean;
      protocolVersion: number | null;
      schemaVersion: number | null;
      contractSha256: string | null;
      reason: string | null;
    };
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
  sklandConfigured?: boolean;
  sklandDisabledReason?: string | null;
  error?: string;
}

export type BoxSource = "skland" | "maa" | "sample";

export interface SklandRole {
  uid: string;
  nickname: string;
  channelName: string;
  isDefault: boolean;
}

export interface SklandAccountSummary {
  accountId: string;
  selectedUid: string;
  roles: SklandRole[];
  credentialExpiresAt: number;
  statusAuthorized: boolean;
}

export interface SklandPlayer {
  uid: string;
  nickname: string;
  level: number | null;
  channelName: string;
  avatarUrl: string | null;
  registerTs: number | null;
  mainStageProgress: string | null;
  resume: string | null;
  subscriptionEnd: number | null;
  storeTs: number | null;
  lastOnlineTs: number | null;
  sanity: {
    current: number;
    max: number;
    completeRecoveryTime: number | null;
  } | null;
  secretary: {
    id: string;
    name: string;
    skinName: string | null;
  } | null;
  counts: {
    operators: number | null;
    furniture: number | null;
    skins: number | null;
  };
}

export type SklandInfrastructureGroup =
  | "control"
  | "trading"
  | "manufacture"
  | "power"
  | "dormitory"
  | "meeting"
  | "hire"
  | "training";

export interface SklandInfrastructureOperator {
  id: string;
  name: string;
  morale: number;
  workTime: number;
  lastMoraleUpdateTs: number;
}

export interface SklandInfrastructureProduction {
  stock: number | null;
  capacity: number | null;
  unitCapacity: number | null;
  completed: number | null;
  remaining: number | null;
  completeWorkTime: number | null;
}

export interface SklandInfrastructureRoomBase<
  TGroup extends SklandInfrastructureGroup = SklandInfrastructureGroup,
> {
  key: string;
  group: TGroup;
  index: number;
  level: number;
  operators: SklandInfrastructureOperator[];
}

export interface SklandTradingOrder {
  delivery: Array<{
    type: "material" | "originium_shard";
    count: number;
  }>;
  reward: {
    type: "lmd" | "orundum";
    count: number;
  };
}

export type SklandControlRoom = SklandInfrastructureRoomBase<"control">;

export interface SklandTradingRoom extends SklandInfrastructureRoomBase<"trading"> {
  product: "gold" | "originium";
  production: SklandInfrastructureProduction;
  orders: SklandTradingOrder[];
  lastUpdateTime: number;
}

export interface SklandManufactureRoom extends SklandInfrastructureRoomBase<"manufacture"> {
  product: "gold" | "battle_record" | "originium" | "unknown";
  production: SklandInfrastructureProduction;
  speed: number;
  lastUpdateTime: number;
}

export type SklandPowerRoom = SklandInfrastructureRoomBase<"power">;

export interface SklandDormitoryRoom extends SklandInfrastructureRoomBase<"dormitory"> {
  comfort: number;
}

export interface SklandMeetingRoom extends SklandInfrastructureRoomBase<"meeting"> {
  clue: {
    board: string[];
    own: number;
    received: number;
    dailyReward: boolean;
    needReceive: number;
    sharing: boolean;
    shareCompleteTime: number;
  };
  completeWorkTime: number;
  lastUpdateTime: number;
}

export interface SklandHireRoom extends SklandInfrastructureRoomBase<"hire"> {
  refreshCount: number;
  completeWorkTime: number;
}

export type SklandInfrastructureRoom =
  | SklandControlRoom
  | SklandTradingRoom
  | SklandManufactureRoom
  | SklandPowerRoom
  | SklandDormitoryRoom
  | SklandMeetingRoom
  | SklandHireRoom;

export interface SklandInfrastructure {
  currentTs: number;
  storeTs: number | null;
  layoutLabel: PresetDef["label"] | null;
  layoutSuggestion: BaseBlueprint | null;
  layoutWarning: string | null;
  rooms: SklandInfrastructureRoom[];
  tiredOperators: string[];
  labor: {
    value: number;
    maxValue: number;
    remainSecs: number;
    lastUpdateTime: number;
  };
  furnitureTotal: number;
  training: {
    trainee: string | null;
    trainer: string | null;
    skillIndex: number;
    remainSecs: number;
    remainPoint: number;
    speed: number;
    completeWorkTime: number;
  } | null;
}

export interface SklandScheduleOperator {
  id: string;
  name: string;
  morale: number;
}

export interface SklandScheduleRoom {
  key: string;
  group: Exclude<SklandInfrastructureGroup, "training">;
  index: number;
  level: number;
  operators: SklandScheduleOperator[];
  product?: "gold" | "battle_record" | "originium" | "unknown";
}

export interface SklandScheduleInfrastructure {
  storeTs: number | null;
  layoutLabel: PresetDef["label"] | null;
  layoutSuggestion: BaseBlueprint | null;
  layoutWarning: string | null;
  rooms: SklandScheduleRoom[];
  tiredOperators: string[];
}

export interface SklandScheduleSnapshot {
  roles: SklandRole[];
  operbox: OperBoxEntry[];
  infrastructure: SklandScheduleInfrastructure;
  sourceName: string;
  warnings: string[];
}

export interface SklandOperatorModule {
  id: string;
  name: string;
  level: number;
  locked: boolean;
  isDefault: boolean;
}

export interface SklandOperatorStatus {
  id: string;
  name: string;
  rarity: number;
  profession: string;
  subProfessionName: string;
  elite: number;
  level: number;
  potential: number;
  favorPercent: number;
  mainSkillLevel: number;
  skills: Array<{
    index: number;
    specializeLevel: number;
  }>;
  modules: SklandOperatorModule[];
  currentSkinName: string | null;
  acquiredAt: number;
  isAssist: boolean;
}

export interface SklandOwnedSkin {
  id: string;
  name: string;
  brandId: string;
  operatorId: string;
  operatorName: string;
  obtainedAt: number;
  isCurrent: boolean;
}

export interface SklandProgress {
  recruit: Array<{
    index: number;
    startTs: number;
    finishTs: number;
    state: "locked" | "standby" | "recruiting" | "completed";
  }> | null;
  routine: {
    daily: { current: number; total: number };
    weekly: { current: number; total: number };
  } | null;
  campaign: {
    records: Array<{
      name: string;
      zoneName: string | null;
      maxKills: number;
    }>;
    reward: { current: number; total: number };
  } | null;
  tower: {
    records: Array<{
      name: string;
      subName: string;
      best: number;
    }>;
    reward: {
      higher: { current: number; total: number };
      lower: { current: number; total: number };
      termTs: number;
    };
  } | null;
  rogue: Array<{
    name: string;
    relicCount: number;
    bankCurrent: number;
    bankRecord: number;
  }> | null;
  activities: Array<{
    name: string;
    startTime: number;
    endTime: number;
    rewardEndTime: number;
    isReplicate: boolean;
    clearedStages: number;
    totalStages: number;
  }> | null;
  bossRush: Array<{
    played: boolean;
    stageCode: string | null;
    stageName: string | null;
    difficulty: string;
  }> | null;
}

export interface SklandStatusSnapshot {
  player: SklandPlayer;
  roles: SklandRole[];
  operbox: OperBoxEntry[];
  infrastructure: SklandInfrastructure;
  operators: SklandOperatorStatus[];
  skins: SklandOwnedSkin[];
  progress: SklandProgress;
  sourceName: string;
  warnings: string[];
}

export interface SklandAuthMethods {
  qr: true;
}

export interface SklandSessionResponse {
  authenticated: boolean;
  configured: boolean;
  authMethods?: SklandAuthMethods;
  disabledReason?: string | null;
  accounts: SklandAccountSummary[];
  activeAccountId: string | null;
  scheduleSnapshot?: SklandScheduleSnapshot;
  error?: string;
  code?: string;
}

export interface SklandQrStartResponse {
  success: boolean;
  scanId?: string;
  scanUrl?: string;
  error?: string;
  code?: string;
}

export interface SklandQrStatusResponse {
  success: boolean;
  status: "waiting" | "scanned" | "expired" | "authenticated";
  scheduleSnapshot?: SklandScheduleSnapshot;
  error?: string;
  code?: string;
}

export interface ShiftComparison {
  planIndex: number;
  score: number;
  matched: string[];
  missing: string[];
  unexpected: string[];
  misplaced: string[];
  tiredScheduled: string[];
}

export type Severity = "ok" | "warn" | "critical";

export interface UserProfileSummary {
  owned: number;
  tier_up_owned: number;
  trade_pool_ready: number;
  manufacture_pool_ready?: number;
  manu_pool_ready?: number;
}

export interface UserProfileComboSnapshot {
  operators: string[];
  final_efficiency?: number;
  mechanic_equivalent_efficiency?: number;
  score?: number;
  trade_pct?: number;
  gold_pct?: number;
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
  daily_trade_efficiency?: number;
  daily_manufacture_efficiency?: number;
  daily_power_efficiency?: number;
  daily_trade?: number;
  daily_manu?: number;
  daily_power?: number;
}

export interface UserProfileAction {
  priority: string;
  kind: string;
  operator: string;
  domain_id: string;
  message: string;
  current_elite?: number;
  tier_up_requirement?: string;
}

export interface UserProfile {
  schema_version: number;
  rotation_profile?: RotationProfile;
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

export interface PlanComputeParams {
  schema_version: 1;
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  labels?: {
    layout?: string | null;
    operbox?: string | null;
  };
  options?: {
    rotation?: RotationProfile;
    top?: number;
    system_preferences?: Record<string, string>;
    maa_title?: string | null;
  };
}

export type RotationProfile =
  | "abc_12_6_6"
  | "main_backup_12_12"
  | "fiammetta_8_8_4_4"
  | "abyssal_7_5_7_5";

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

export type AppErrorCode =
  | "AIC-REQ-1001"
  | "AIC-REQ-1002"
  | "AIC-BOX-1101"
  | "AIC-LAYOUT-1201"
  | "AIC-AUTH-2001"
  | "AIC-AUTH-2002"
  | "AIC-AUTH-2003"
  | "AIC-AUTH-2004"
  | "AIC-AUTH-2005"
  | "AIC-AUTH-2006"
  | "AIC-AUTH-2007"
  | "AIC-PLAN-3001"
  | "AIC-PLAN-3002"
  | "AIC-PLAN-3003"
  | "AIC-PLAN-3004"
  | "AIC-FEEDBACK-4001"
  | "AIC-FEEDBACK-4002"
  | "AIC-SYS-5000"
  | "AIC-RATE-6001"
  | "AIC-LOCAL-7001";

export interface ApiFieldError {
  path: string;
  code: string;
  message: string;
}

export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  success: false;
  error: {
    code: AppErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
    fieldErrors?: ApiFieldError[];
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PublicFeatureFlags {
  debugTools: boolean;
  rateLimit: boolean;
}

export interface PublicHealthData {
  status: "ready" | "unavailable";
  plannerReady: boolean;
  skland?: {
    available: boolean;
    message: string | null;
  };
  features: PublicFeatureFlags;
}

export interface PublicPlanDebug {
  command?: string;
  stdout?: string;
  stderr?: string;
  debugBundle?: DebugBundle;
}

export interface PublicPlanData {
  profile: UserProfile;
  maa: MaaJson;
  rotation: RotationJson;
  durationMs: number;
  diagnosticId: string;
  debug?: PublicPlanDebug;
}

export interface SampleOperboxData {
  sourceName: "243 全精二示例";
  operbox: OperBoxEntry[];
}

export interface FeedbackRoom {
  id: string;
  title: string;
  group: string;
  operators: string[];
}

export interface FeedbackRequest {
  diagnosticId: string;
  room: FeedbackRoom;
  note: string;
  consent: true;
}

export interface FeedbackData {
  feedbackId: string;
  savedAt: string;
}

export interface SklandSessionData {
  authenticated: boolean;
  configured: boolean;
  authMethods?: SklandAuthMethods;
  disabledReason?: string | null;
  accounts: SklandAccountSummary[];
  activeAccountId: string | null;
  scheduleSnapshot?: SklandScheduleSnapshot;
}

export interface SklandStatusData {
  authorized: boolean;
  accounts: SklandAccountSummary[];
  activeAccountId: string | null;
  snapshot?: SklandStatusSnapshot;
}

export interface SklandQrStartData {
  scanId: string;
  scanUrl: string;
  expiresInSeconds: number;
}

export interface SklandQrStatusData {
  status: "waiting" | "scanned" | "expired" | "authenticated";
  accounts?: SklandAccountSummary[];
  activeAccountId?: string | null;
  scheduleSnapshot?: SklandScheduleSnapshot;
}

export interface DisplayError {
  code: AppErrorCode;
  message: string;
  requestId?: string;
  retryable: boolean;
  fieldErrors?: ApiFieldError[];
}
