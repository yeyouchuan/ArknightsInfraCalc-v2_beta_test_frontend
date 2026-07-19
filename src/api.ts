import {
  BaseBlueprint,
  DebugBundle,
  FeedbackApiResponse,
  HealthApiResponse,
  IssueReport,
  OperBoxEntry,
  PlanApiResponse,
  SklandQrStartResponse,
  SklandQrStatusResponse,
  SklandSessionResponse,
} from "./types";

export async function runPlan(payload: {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
}): Promise<PlanApiResponse> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as PlanApiResponse;

  if (!response.ok && !body.error) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }
  return body;
}

export async function getHealth(): Promise<HealthApiResponse> {
  const response = await fetch("/api/health");
  return response.json();
}

async function sklandJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}: ${response.statusText}`);
  return body;
}

export function getSklandSession(): Promise<SklandSessionResponse> {
  return sklandJson("/api/skland/session");
}

export function startSklandQr(): Promise<SklandQrStartResponse> {
  return sklandJson("/api/skland/auth/qr", { method: "POST" });
}

export function pollSklandQr(scanId: string): Promise<SklandQrStatusResponse> {
  return sklandJson("/api/skland/auth/qr/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId }),
  });
}

export function syncSkland(): Promise<SklandSessionResponse> {
  return sklandJson("/api/skland/sync", { method: "POST" });
}

export function selectSklandRole(uid: string): Promise<SklandSessionResponse> {
  return sklandJson("/api/skland/role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });
}

export function logoutSkland(): Promise<{ success: boolean }> {
  return sklandJson("/api/skland/session", { method: "DELETE" });
}

export async function getSampleOperbox(): Promise<{
  success: boolean;
  sourceName?: string;
  operbox?: OperBoxEntry[];
  error?: string;
}> {
  const response = await fetch("/api/sample-operbox");
  return response.json();
}

export async function saveFeedback(payload: {
  issue: IssueReport;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  debugBundle?: DebugBundle;
}): Promise<FeedbackApiResponse> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as FeedbackApiResponse;

  if (!response.ok && !body.error) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }
  return body;
}
