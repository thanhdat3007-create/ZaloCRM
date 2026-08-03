# Job Spec

`/ak:orchestrate` accepts either a YAML job spec or a free-form task that the
coordinator first turns into a YAML spec under the run report directory.

## Schema

```yaml
version: 1
concurrency: 2
defaults:
  timeout: 10m
  sandbox: workspace-write
  approval_policy: on-request
  capture: true
jobs:
  - id: string
    # first-class: internal | claude-code | codex | ak-run
    # external (preflight-gated): opencode | copilot | cursor | cline | qwen-code | grok | kimi | agy
    runtime: string
    agent: string        # runtime: internal only — subagent type to dispatch
    fallback_runtime: [string]
    task: scout | architecture | implement | review | audit | security | test | docs | mechanical
    importance: normal | high
    model: string
    cwd: string
    prompt: string
    skill: string
    allowed_tools: [string]
    disallowed_tools: [string]
    sandbox: read-only | workspace-write | danger-full-access
    approval_policy: untrusted | on-request | never
    isolation: none | worktree
    timeout: 10m
    expected_output: string
    depends_on: [job-id]
    destructive: false
    checks: [string]
```

Runtime tiers and per-runtime flags:
[runtime-matrix.md](runtime-matrix.md). Model selection when `model` is
omitted: [model-routing.md](model-routing.md) via `task`. Harness strengths
and weaknesses for runtime choice:
[harness-profiles.md](harness-profiles.md). In-session subagent dispatch,
agent selection, and capture mapping for `runtime: internal`:
[internal-routing.md](internal-routing.md).

`isolation: worktree` runs the job in its own git worktree under
`<run-dir>/worktrees/<job-id>` (see SKILL.md "Worktree Isolation"). Required
for parallel jobs that write inside the same repository and for any writing
job on an all-or-nothing approval harness (kimi headless, cline headless,
qwen `--yolo`, cursor `--force`, grok `--always-approve`).

`importance: high` marks implement jobs whose failure is expensive (public
contracts, security-sensitive paths, cross-module changes); routing rule 7
escalates them to `opus` or `gpt-5.5` with raised reasoning effort.

## Required Fields

Every job must include:

- `id`
- `runtime`
- `cwd`
- one of `prompt` or `skill`
- `timeout` or `defaults.timeout`
- `expected_output`
- `model` or `task` (when both are set, `model` wins)

`skill` is valid only with `runtime: ak-run`. `agent` is valid only with
`runtime: internal`; internal jobs must not set `model` (the agent definition
owns its model — see [internal-routing.md](internal-routing.md)).

## Execution Semantics

- Preflight runs before stage 1: every distinct runtime is probed once
  (`<binary> --version`; for `internal`, agent availability per
  [internal-routing.md](internal-routing.md)). A job whose runtime probe fails
  moves to the first available entry in `fallback_runtime` (model re-routed
  per `task` for the new runtime); with no available fallback the job is
  marked `blocked`.
- Jobs with no dependencies run in the first stage.
- A job runs after every `depends_on` job succeeds.
- Jobs in the same stage may run in parallel up to `concurrency`.
- If a dependency fails or times out, dependent jobs are marked `blocked`.
- A failed job is not retried unless the user explicitly requests a retry.
- A flag error on an external runtime (unknown flag/model) fails the job with a
  note to re-verify that runtime-matrix row; the coordinator does not guess
  replacement flags.

## Run State and Resume

`<run-dir>/state.json` is the run tracker, rewritten (atomic replace) after
every job transition:

```json
{
  "runId": "orchestrate-260705-2210",
  "specPath": "jobs.yaml",
  "jobs": {
    "scout-session-api": {
      "status": "queued|running|success|failed|blocked|interrupted",
      "runtime": "claude-code",
      "model": "haiku",
      "attempts": 1,
      "startedAt": "2026-07-05T22:10:04+07:00",
      "endedAt": null,
      "worktree": null
    }
  }
}
```

`/ak:orchestrate --resume <run-dir>` reloads `jobs.yaml` + `state.json`, then:

- `success` jobs are skipped; their outputs are reused.
- `running` jobs (interrupted mid-flight) become `interrupted` and are
  re-dispatched with `attempts` + 1; `destructive: true` jobs need fresh
  confirmation before re-dispatch. Prior partial output is preserved under
  `<job-id>/attempt-<n>/`.
- `blocked` is recomputed from current runtime availability and dependency
  results.
- The arbiter re-runs whenever any reviewed job re-ran.

## Capture Contract

Each job writes:

```text
<run-dir>/<job-id>/command.txt
<run-dir>/<job-id>/stdout.txt
<run-dir>/<job-id>/stderr.txt
<run-dir>/<job-id>/status.json
<run-dir>/<job-id>/artifacts/
```

`command.txt` must redact secrets and must not include raw environment values.
`stdout.txt` and `stderr.txt` should be bounded; if truncated, include a marker
and preserve the first and last useful sections.

`runtime: internal` jobs have no process surface: they write `result.md`
(the subagent's final text) instead of `command.txt`/`stdout.txt`/
`stderr.txt`, and `status.json` records the resolved `agent` with
`exitCode: null` — see internal-routing.md "Capture Mapping".

## Arbiter Contract

After execution, the arbiter reads every `status.json`, job output, and listed
check result. The coordinator may report `Arbiter: pass` only when:

- every required job succeeded;
- every expected output is present;
- every listed check passed;
- no job output contradicts another job output;
- no claim relies on unavailable evidence;
- unresolved questions are either absent or explicitly accepted by the user.

## Examples

Sequential:

```yaml
version: 1
jobs:
  - id: scout
    runtime: claude-code
    cwd: D:/www/claudekit/agentkit
    prompt: "Scout the settings API and list extension points."
    timeout: 10m
    expected_output: "Markdown scout report."
  - id: tests
    runtime: codex
    cwd: D:/www/claudekit/agentkit
    prompt: "Design tests from the scout report."
    depends_on: [scout]
    timeout: 10m
    expected_output: "Markdown test plan."
```

Parallel fan-out plus arbiter:

```yaml
version: 1
concurrency: 3
jobs:
  - id: backend
    runtime: claude-code
    cwd: D:/www/claudekit/agentkit
    prompt: "Review backend implementation risks."
    timeout: 12m
    expected_output: "Risk report with file evidence."
  - id: frontend
    runtime: codex
    cwd: D:/www/claudekit/agentkit
    prompt: "Review frontend implementation risks."
    timeout: 12m
    expected_output: "Risk report with file evidence."
  - id: arbiter
    runtime: claude-code
    cwd: D:/www/claudekit/agentkit
    prompt: "Compare backend and frontend reports and identify contradictions."
    depends_on: [backend, frontend]
    timeout: 8m
    expected_output: "Final arbiter verdict."
```

AgentKit skill run:

```yaml
version: 1
jobs:
  - id: research
    runtime: ak-run
    skill: engineer/ak-research
    cwd: D:/www/claudekit/agentkit
    prompt: "Research safe rollout options for the new command."
    timeout: 15m
    expected_output: "Research report with recommended rollout."
```

Task-routed with external fallback (model picked per
[model-routing.md](model-routing.md); cross-family arbiter):

```yaml
version: 1
concurrency: 3
jobs:
  - id: scout-cli
    runtime: codex
    task: scout
    cwd: D:/www/claudekit/agentkit
    prompt: "Map the kit loader entry points and list extension seams."
    timeout: 8m
    expected_output: "Markdown map with file paths."
  - id: scout-docs
    runtime: opencode
    fallback_runtime: [copilot, claude-code]
    task: scout
    cwd: D:/www/claudekit/agentkit
    prompt: "Summarize kit-yaml-spec.md constraints relevant to loaders."
    timeout: 8m
    expected_output: "Constraint summary with doc citations."
  - id: arbiter
    runtime: claude-code
    task: review
    cwd: D:/www/claudekit/agentkit
    prompt: "Cross-check both scout reports for contradictions and gaps."
    depends_on: [scout-cli, scout-docs]
    timeout: 8m
    expected_output: "Arbiter verdict."
```

Mixed-mode: internal fan-out, CLI implementation, cross-family review
(agent picked per [internal-routing.md](internal-routing.md)):

```yaml
version: 1
concurrency: 3
jobs:
  - id: scout-loader
    runtime: internal
    agent: Explore
    task: scout
    cwd: D:/www/claudekit/agentkit
    prompt: "Map the kit loader entry points and list extension seams."
    timeout: 8m
    expected_output: "Markdown map with file paths."
  - id: scout-spec
    runtime: internal          # no agent: — task class routes it (scout → Explore)
    task: scout
    cwd: D:/www/claudekit/agentkit
    prompt: "Summarize kit-yaml-spec.md constraints relevant to loaders."
    timeout: 8m
    expected_output: "Constraint summary with doc citations."
  - id: implement-loader
    runtime: codex             # needs the OS sandbox for workspace writes
    task: implement
    sandbox: workspace-write
    cwd: D:/www/claudekit/agentkit
    prompt: "Implement the agreed loader extension from both scout reports."
    depends_on: [scout-loader, scout-spec]
    timeout: 20m
    expected_output: "Diff summary plus passing focused tests."
  - id: review-loader
    runtime: codex             # cross-family review per model-routing rule 3
    task: review
    cwd: D:/www/claudekit/agentkit
    prompt: "Review the loader change for regressions and contract breaks."
    depends_on: [implement-loader]
    timeout: 10m
    expected_output: "Review verdict with file evidence."
```
