import type {
  ApiFailure,
  ApiResponse,
  AppErrorCode,
  BaseBlueprint,
  DisplayError,
  FeedbackData,
  FeedbackRequest,
  OperBoxEntry,
  PublicHealthData,
  PublicPlanData,
  RotationProfile,
  SampleOperboxData,
  SklandQrStartData,
  SklandQrStatusData,
  SklandSessionData,
} from "./types";

export class ApiClientError extends Error implements DisplayError {
  readonly code: AppErrorCode;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly fieldErrors?: ApiFailure["error"]["fieldErrors"];

  constructor(error: ApiFailure["error"]) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.requestId = error.requestId;
    this.retryable = error.retryable;
    this.fieldErrors = error.fieldErrors;
  }
}

function networkError(): ApiClientError {
  return new ApiClientError({
    code: "AIC-SYS-5000",
    message: "无法连接服务，请检查网络后重试。",
    requestId: crypto.randomUUID(),
    retryable: true,
  });
}

async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw networkError();
  }

  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (body?.success === true) return body.data;
  if (body?.success === false) throw new ApiClientError(body.error);
  throw new ApiClientError({
    code: "AIC-SYS-5000",
    message: "服务返回了无法识别的响应，请稍后重试。",
    requestId: response.headers.get("X-Request-Id") ?? crypto.randomUUID(),
    retryable: true,
  });
}

export function toDisplayError(error: unknown, fallback: string): DisplayError {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable,
      fieldErrors: error.fieldErrors,
    };
  }
  return {
    code: "AIC-SYS-5000",
    message: fallback,
    retryable: true,
  };
}

export function runPlan(payload: {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  rotation: RotationProfile;
}): Promise<PublicPlanData> {
  return requestData("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getHealth(): Promise<PublicHealthData> {
  return requestData("/api/health");
}

export function getSklandSession(): Promise<SklandSessionData> {
  return requestData("/api/skland/session");
}

export function startSklandQr(): Promise<SklandQrStartData> {
  return requestData("/api/skland/auth/qr", { method: "POST" });
}

export function pollSklandQr(scanId: string): Promise<SklandQrStatusData> {
  return requestData("/api/skland/auth/qr/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId }),
  });
}

export function syncSkland(): Promise<SklandSessionData> {
  return requestData("/api/skland/sync", { method: "POST" });
}

export function selectSklandRole(accountId: string, uid: string): Promise<SklandSessionData> {
  return requestData("/api/skland/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, uid }),
  });
}

export function logoutSkland(accountId?: string): Promise<SklandSessionData> {
  return requestData("/api/skland/session", {
    method: "DELETE",
    ...(accountId ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    } : {}),
  });
}

export function getSampleOperbox(): Promise<SampleOperboxData> {
  return requestData("/api/sample-operbox");
}

export function saveFeedback(payload: FeedbackRequest): Promise<FeedbackData> {
  return requestData("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
