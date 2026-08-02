# Frontend Serve Guide

The Next server keeps one `infra-cli serve` process alive instead of spawning a CLI process for every layout.

## Transport

Start the worker once:

```bash
infra-cli serve
```

- stdin: one JSON request per line.
- stdout: one JSON response per line.
- stderr: logs only; never parse stderr as protocol output.

## Capability gate

Before choosing a plan method, send:

```json
{"id":1,"method":"ping","params":{}}
```

The frontend uses `plan.compute` only when all three fields match the contract it was built against:

```json
{
  "id": 1,
  "ok": true,
  "result": {
    "pong": true,
    "protocol_version": 1,
    "plan_schema_version": 1,
    "plan_contract_sha256": "52b78160b7f3290c6939807af5b7d6d31ee8322ea68de9288773eebca32d5102"
  }
}
```

If the version fields are missing or the hash differs, the current beta frontend keeps using the legacy `plan` method. This compatibility path can be removed only after the bundled and deployed Workers pass the same gate.

## `plan.compute` v1

The request contains the complete layout and operbox inline:

```json
{
  "id": 2,
  "method": "plan.compute",
  "params": {
    "schema_version": 1,
    "layout": {
      "template": "243",
      "drone_cap": 235,
      "scenario": {},
      "rooms": []
    },
    "operbox": [],
    "labels": {
      "layout": "243",
      "operbox": "Current Box"
    },
    "options": {
      "rotation": "abc_12_6_6",
      "top": 20,
      "system_preferences": {},
      "maa_title": "My schedule"
    }
  }
}
```

The actual request must contain 1–64 rooms and 1–1000 operators. Room IDs, operator IDs, and operator names must be non-empty and unique. The frontend rejects duplicate operator identities instead of rewriting them.

Successful responses contain all outputs inline:

```json
{
  "id": 2,
  "ok": true,
  "elapsed_ms": 123,
  "result": {
    "schema_version": 1,
    "profile": {},
    "rotation": {
      "profile": "abc_12_6_6",
      "daily": {},
      "shifts": []
    },
    "maa": {}
  }
}
```

The frontend validates `schema_version`, `profile`, `rotation.shifts`, and `maa` before marking the run successful. It then persists the inline profile and MAA values into the run directory so debug bundle paths always refer to real files.

Error responses use the normal serve envelope:

```json
{"id":2,"ok":false,"elapsed_ms":3,"error":{"code":"PLAN_FAILED","stage":"plan.compute","message":"..."}}
```

## Legacy `plan`

Workers that do not pass the capability gate continue to receive path-based requests:

```json
{"id":3,"method":"plan","params":{"layout":"tmp/layout.json","operbox":"tmp/operbox.json","profile_out":"tmp/profile.json","maa_out":"tmp/maa.json","output_dir":"tmp/shifts","rotation":"abc_12_6_6","top":20,"maa_title":"My schedule"}}
```

All paths are selected by the frontend. After a successful response, the frontend reads `profile_out`, `maa_out`, and `team_shift_*.json` from the run directory.

## Lifecycle

1. Start one Worker on demand.
2. Ping it before a solve and select `plan.compute` or legacy `plan`.
3. Write one request line and match the response by `id`.
4. Persist the request, response, stdout, stderr, profile, MAA, rotation, and debug bundle.
5. If the process exits while a request is active, restart it and retry the active request once.

## Public API boundary

The CLI response is an internal transport object. It must never be returned directly from a Next.js route handler.

`src/server/infra.ts` may retain CLI paths, commands, stdout, stderr, serve requests/responses and run-directory metadata for local diagnostics. `src/server/public-plan.ts` is the required boundary before `/api/plan`: it constructs a new allowlisted DTO containing only profile, MAA, rotation, duration and an opaque diagnostic ID. Rotation is rebuilt through `src/rotation-result.ts`; only the selected profile, daily summary, normalized shifts, team state, weighted efficiency and normalized room efficiency are public. Raw `efficiencies`, assignments and future unknown Worker fields are not forwarded.

When `BETA_DEBUG_TOOLS_ENABLED=1`, the server may append diagnostic values under `data.debug`. That switch is server-owned; a query parameter cannot enable it. Public contract tests recursively reject internal field names in production responses, and the v4 browser persistence layer strips `data.debug` even in a debug session.

Do not extend the public DTO by spreading an internal result:

```ts
// Incorrect: leaks new internal fields automatically.
return NextResponse.json({ success: true, data: { ...internalResult } });

// Correct: construct the allowlist through the boundary mapper.
return successResponse(toPublicPlanData(internalResult, labels, requestId), requestId);
```
