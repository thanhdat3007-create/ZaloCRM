# Internal Runtime (In-Session Subagent Dispatch)

Verified: 2026-07-09.

`runtime: internal` dispatches a job through the current harness's subagent
mechanism (the Agent/Task tool on Claude Code) instead of spawning a CLI
subprocess. No extra install, no cold start, and access to the specialized
agents already installed on the machine. It is the only runtime available when
the user has just one harness and no other coding-agent CLIs.

## When to Route Internal

Prefer `runtime: internal` when:

- The job is scout/review/docs/research fan-out — cheap, read-heavy, and the
  subprocess cold start would dominate the job's cost.
- A specialized installed agent matches the task better than a generic CLI
  prompt (its tool allowlist and system prompt are pre-tuned).
- No other runtime CLI is installed, or `--internal` was passed.

Prefer a CLI runtime when:

- The job needs a specific model or model family (internal jobs cannot pick
  models — see "Model Ownership").
- The job needs an OS-level sandbox or per-job permission flags
  (`destructive: true`, untrusted prompts, risky writes).
- The job needs cross-family review per model-routing rule 3 (arbiter and
  review jobs judging Claude-produced output should reach `gpt-5.5` via
  codex when available).
- The run is designed to preserve the current session's token budget.

## Agent Discovery (Preflight)

The internal "probe" is agent availability, recorded in
`<run-dir>/runtimes.json`:

1. The agent types the harness lists for its Agent tool in the current
   session (authoritative).
2. `~/.claude/agents/` and project `.claude/agents/` as the on-disk view when
   the session list is not introspectable.

The installed set differs per machine — kit agents (planner, code-reviewer,
fullstack-developer, ...) exist only where that kit is installed. Never
assume an agent name; check, then fall back.

## Task-Class Routing Table

Job `agent:` wins when set. Otherwise map the task class:

| Task class | Preferred agent | Substitute | Last resort |
| --- | --- | --- | --- |
| `scout` | `Explore` | `researcher` | `general-purpose` |
| `architecture` | `brainstormer` | `planner` | `general-purpose` |
| `implement` | `fullstack-developer` | — | `general-purpose` |
| `review` / `audit` / `security` | `code-reviewer` | — | `general-purpose` |
| `test` | `tester` | — | `general-purpose` |
| `docs` | `docs-manager` | — | `general-purpose` |
| `mechanical` | `general-purpose` | — | — |

Rules:

- The table is a hint list, not a registry. The source of truth is the live
  agent list the preflight recorded in `runtimes.json`: resolve each task
  class against that list first by the names above, then — when a name is
  absent or renamed — by matching agent *descriptions* to the task class
  (e.g. any installed agent describing itself as a code reviewer serves
  `review`). Snapshot names going stale therefore degrades nothing; only
  update this table when a better default emerges. Record the resolved agent
  in `status.json`.
- A missing named `agent:` degrades in order: substitute → description match
  → `general-purpose` → the job's `fallback_runtime` chain. Record every
  substitution.
- `allowed_tools`/`disallowed_tools` on an internal job are advisory prompt
  constraints unless the harness's Agent tool enforces them; the agent
  definition's own allowlist is the hard boundary.

## Dispatch Contract

- One subagent per job; independent same-stage jobs launch in a single batch
  up to `concurrency`.
- Prompt must include: the task, `cwd` (and worktree path when isolated),
  files it may read/write, the `expected_output`, "DO NOT COMMIT OR PUSH",
  and the instruction to return the deliverable as its final message.
- Writing jobs that run in parallel with any other writing job require
  `isolation: worktree`. The coordinator creates the worktree first and the
  prompt pins the subagent inside it. This isolation is prompt-level —
  weaker than a CLI sandbox; keep `destructive: true` off internal.
- Internal jobs run at the session's permission mode. There is no per-job
  sandbox or approval flag.

## Capture Mapping

Internal jobs have no process surface. Map the capture contract:

| CLI capture | Internal equivalent |
| --- | --- |
| `stdout.txt` | `result.md` — the subagent's final text |
| `stderr.txt` | none (harness errors go in `status.json.error`) |
| `command.txt` | none — `status.json.agent` records the dispatch |
| exit code | `exitCode: null`; `status` carries success/failed |

`status.json` for an internal job:

```json
{
  "id": "scout-session-api",
  "runtime": "internal",
  "agent": "Explore",
  "model": null,
  "task": "scout",
  "status": "success",
  "exitCode": null,
  "durationMs": 45210,
  "timedOut": false,
  "attempts": 1,
  "worktree": null
}
```

Metrics history lines use `runtime: internal` and the resolved `agent` in
place of a model id; token/cost figures are omitted unless the harness
reports per-agent usage.

## Model Ownership

The subagent's model comes from its agent definition (frontmatter), not from
[model-routing.md](model-routing.md). The coordinator routes by picking the
agent. Consequences:

- Do not set `model:` on an internal job; if a job pins `model:`, route it to
  a CLI runtime.
- Review/audit routing rule 3 (cross-family `gpt-5.5` preference) cannot be
  satisfied internally — use internal `code-reviewer` only as the fallback
  when codex is unavailable, and say so in the report.

## Timeout and Resume

- Timeouts are accounting-only: mark the job failed/`timedOut` when the
  subagent exceeds its bound, but the coordinator cannot force-kill it.
  Scope prompts tightly instead of relying on the timeout.
- Resume works unchanged through `state.json`: `success` internal jobs are
  skipped and their `result.md` reused; interrupted ones re-dispatch as a new
  attempt (a fresh subagent — no session continuity is assumed).

## Boundaries

- This runtime is fire-and-collect, like every other row: one prompt in, one
  result out. Multi-session teamwork with inter-agent messaging is the team
  skill (`ak-team`), not orchestrate.
- A single scout across the repo does not need orchestrate at all — use the
  scout skill (`ak-scout`) or one direct subagent. Orchestrate earns its
  overhead when there are stages, mixed runtimes, or an arbiter gate.
