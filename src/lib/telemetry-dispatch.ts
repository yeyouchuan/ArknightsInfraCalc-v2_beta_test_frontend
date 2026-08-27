import type { TelemetryInput } from "@/telemetry-contract";

/** Keep telemetry implementation out of the initial application bundle. */
export function trackTelemetry(input: TelemetryInput): void {
  void import("./telemetry")
    .then(({ track }) => track(input))
    .catch(() => undefined);
}
