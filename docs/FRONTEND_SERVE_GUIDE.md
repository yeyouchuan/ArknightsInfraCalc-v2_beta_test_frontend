# Frontend Serve Guide

Use `infra-cli serve` instead of spawning one CLI process per layout.

## Protocol

Start once:

```bash
infra-cli serve
```

- stdin: one JSON request per line.
- stdout: one JSON response per line.
- stderr: logs only; do not parse as protocol.

## Request

```json
{"id":1,"method":"plan","params":{"layout":"tmp/layout.json","operbox":"tmp/operbox.json","profile_out":"tmp/profile.json","maa_out":"tmp/maa.json","output_dir":"tmp/shifts","top":20,"maa_title":"My schedule"}}
```

All file paths are chosen by the frontend.

`plan.params`:

| Field | Required | Meaning |
|------|----------|---------|
| `operbox` | yes | OperBox JSON or xlsx |
| `layout` | no | layout JSON; default is built-in 243 fixture |
| `baseline` | no | profile comparison operbox |
| `profile_out` | no | profile JSON output path |
| `maa_out` | no | MAA JSON output path |
| `output_dir` | no | writes `team_shift_*.json` |
| `top` | no | search depth, default `20` |
| `maa_title` | no | MAA title |

## Response

Success:

```json
{"id":1,"ok":true,"elapsed_ms":123,"result":{"layout":"tmp/layout.json","operbox":"tmp/operbox.json","owned":418,"top":20,"profile_out":"tmp/profile.json","maa_out":"tmp/maa.json","output_dir":"tmp/shifts","daily_trade":7.44,"daily_manu":520.12,"daily_power":55.12}}
```

Error:

```json
{"id":1,"ok":false,"elapsed_ms":3,"error":{"message":"..."}}
```

## Frontend Changes

1. Spawn `infra-cli serve` once when the app starts or before the first solve.
2. For each solve, write one request line to stdin.
3. Wait for one stdout line with the same `id`.
4. Read `profile_out` and `maa_out` files after `ok: true`.
5. If the process exits, restart it and resend the active request.
