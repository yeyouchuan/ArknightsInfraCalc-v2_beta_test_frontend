import {
  BaseBlueprint,
  DebugBundle,
  FeedbackApiResponse,
  HealthApiResponse,
  IssueReport,
  OperBoxEntry,
  PlanApiResponse,
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
