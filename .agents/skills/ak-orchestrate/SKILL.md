---
name: ak:orchestrate
description: "Coordinate multiple coding-agent CLIs headlessly, plus in-session harness subagents. Use for staged or parallel jobs across Claude Code, Codex, AgentKit skill runs, internal harness subagents (Agent tool via runtime: internal or --internal), and external CLIs (OpenCode, Copilot, Cursor, Cline, Qwen Code, Grok, Kimi) with task-based model routing, OS-aware dispatch, worktree-isolated parallel writes, resumable run state, capture, safety gates, and an arbiter review."
user-invocable: true
when_to_use: "Invoke when work should be split across headless coding-agent runtimes or in-session harness subagents, routed to best-fit models per task type, or run as isolated job prompts and then reviewed before handoff."
category: dev-tools
keywords: [orchestrate, headless, multi-agent, internal, subagents, claude-code, codex, opencode, copilot, cline, model-routing, worktree, resume, parallel, arbiter]
argument-hint: "<job-spec.yaml | task description | --resume <run-dir>> [--yes] [--internal]"
license: MIT
metadata:
  author: agentkit
  version: "1.4.0"
---

# Orchestrate

Coordinate headless coding-agent jobs across Claude Code, Codex, AgentKit
skill runs, in-session harness subagents (`runtime: internal`), and
preflight-gated external CLIs. This is a skill-level coordinator, not a new
`ak` command. It uses existing runtime CLIs, `ak run` surfaces, and the current
harness's Agent tool, routes each job to the best-fit model for its task type,
records every job result, and requires an arbiter pass before reporting
success.

## Inputs

Accepted forms:

```bash
/ak:orchestrate "research three implementation options and compare them"
/ak:orchestrate "compare the auth options" --internal
/ak:orchestrate plans/orchestrate-jobs.yaml
/ak:orchestrate plans/orchestrate-jobs.yaml --yes
/ak:orchestrate --resume plans/reports/orchestrate-<timestamp>
```

Use a YAML job spec for repeatable runs. For free-form requests, first write a
temporary job spec under `plans/reports/orchestrate-<timestamp>/jobs.yaml` and
then execute it.

`--internal` is a routing preference, not a hard mode: for free-form requests
and spec jobs with no explicit `runtime:`, prefer `runtime: internal`
(in-session subagent dispatch) and fall back to CLI runtimes only when a job
needs a different model family, an OS-level sandbox, or a harness the current
session cannot provide. Jobs that pin a `runtime:` explicitly are never
overridden by `--internal`.

## Pipeline

1. **Intake**
   - Read the request or job spec.
   - Identify the workspace root, runtime prerequisites, destructive intent,
     expected outputs, and any dependencies between jobs.
   - Refuse to run jobs that would require secrets in prompts, logs, or reports.

2. **Plan and route jobs**
   - Convert simple lists into sequential jobs.
   - Use `depends_on` to form stages; jobs in the same stage may run in
     parallel up to the chosen concurrency cap.
   - Classify each job's `task` (scout, architecture, implement, review, test,
     docs, mechanical) and pick runtime + model per
     [model-routing.md](references/model-routing.md): fan-out work gets
     fast-cheap models, synthesis and judgment get frontier models, and
     review/audit/security jobs (including the arbiter) route to `gpt-5.5`
     first with `opus` as the availability fallback.
   - Prefer first-class runtimes (`internal`, `claude-code`, `codex`,
     `ak-run`); use external runtimes for capacity, cost routing, or when a
     model is only reachable there, and give each external job a
     `fallback_runtime` chain. Weigh harness strengths per
     [harness-profiles.md](references/harness-profiles.md).
   - For `runtime: internal` jobs, pick the subagent per
     [internal-routing.md](references/internal-routing.md): the job's `agent:`
     field wins; otherwise map the task class to the preferred installed
     agent, falling back to `general-purpose`. Model routing does not apply —
     the agent definition owns its model.
   - Mark expensive-to-fail implement jobs `importance: high` (public
     contracts, security-sensitive paths, cross-module changes) so routing
     rule 7 escalates them to `opus` or `gpt-5.5` with raised reasoning
     effort.
   - Set `isolation: worktree` on every writing job that runs in parallel
     with another writing job in the same repository, and on any writing job
     assigned to an all-or-nothing approval harness.
   - Write each prompt to name the skill(s) the agent should use for its task
     type with a concrete path (harness-profiles "Harness Enablement") — do
     not rely on auto-discovery in headless one-shots.
   - Assign explicit `cwd`, timeout, capture directory, and expected output.

3. **Preflight**
   - Probe every distinct runtime once (`<binary> --version`); record results
     and the host OS in `<run-dir>/runtimes.json`, then apply the OS notes in
     runtime-matrix "OS Awareness" (install channels, sandbox strength,
     prompt quoting, timeout mechanism).
   - For `runtime: internal`, the probe is agent availability, not a binary:
     list the agent types the current harness exposes (Agent tool list,
     `~/.claude/agents/`, project `.claude/agents/`) and record them in
     `runtimes.json`. A named `agent:` that is missing falls back per
     internal-routing.md (substitute agent, then `general-purpose`, then
     `fallback_runtime`).
   - Check harness enablement for each target runtime: rules file present
     (`CLAUDE.md` / `AGENTS.md` / `.clinerules` per harness-profiles) and kit
     skills installed. Offer `ak kit init <kit> --target <runtime>` /
     `ak update --kits <kit>` as a visible setup step — never install
     silently.
   - Re-route jobs whose runtime is missing to their first available
     `fallback_runtime` (model re-picked per `task`); mark them `blocked` when
     no fallback is available.
   - For `agy`, also confirm the CLI is authenticated — its first-launch OAuth
     is interactive and would hang a headless job.

4. **Safety gate**
   - Confirm the target `cwd` for each job.
   - Default to non-bypass permission modes.
   - For `destructive: true` or detected write/deploy/release intent, stop for
     confirmation unless the user passed `--yes`.
   - Never use a bypass flag by default on any runtime: Claude Code
     `--dangerously-skip-permissions`, Codex
     `--dangerously-bypass-approvals-and-sandbox`, Copilot `--allow-all-tools`,
     Cursor `--force`, Cline `--yolo`, Qwen `--yolo`, Grok `--always-approve`,
     agy `--dangerously-skip-permissions`.
   - Kimi and Cline headless modes are auto-approved by default; give them
     read/report work or an isolated `cwd` only, and set
     `CLINE_COMMAND_PERMISSIONS` deny globs for Cline.
   - Internal jobs run under the current session's permission mode — there is
     no per-job sandbox flag. A writing internal job that runs in parallel
     with any other writing job requires `isolation: worktree`, and its
     isolation is prompt-level (the subagent is instructed to stay inside its
     worktree), weaker than an OS sandbox. Route `destructive: true` jobs to a
     sandboxed CLI runtime instead of internal.

5. **Dispatch**
   - Start independent jobs in parallel only when their file ownership and
     outputs do not overlap, or each writing job has its own worktree.
   - Create worktrees for `isolation: worktree` jobs before dispatch and point
     each job's `cwd` at its worktree (see "Worktree Isolation").
   - Update `<run-dir>/state.json` on every job transition so an interrupted
     run can resume (see job-spec "Run State and Resume").
   - Capture stdout, stderr, exit status, wall time, generated artifacts, and
     the exact command line with secrets redacted.
   - Dispatch `runtime: internal` jobs through the harness Agent tool (one
     subagent per job, parallel jobs in one batch up to `concurrency`). The
     subagent's final text is the capture: write it to `<job-id>/result.md`
     and record the agent type in `status.json` (`exitCode: null`) — there is
     no stdout/stderr/command line. Prompt contract per internal-routing.md.
   - Mark timeout or failed jobs as failed; do not retry silently.

6. **Arbiter review**
   - After all jobs settle, run a separate review pass.
   - Compare outputs with `expected_output`.
   - Run any checks listed in the job spec.
   - Flag contradictions, unverified claims, missing artifacts, and failed
     checks. Do not summarize an unverified result as complete.

7. **Coordinator report**
   - Write `plans/reports/orchestrate-<timestamp>/report.md`.
   - Include per-job status, artifacts, errors, arbiter verdict, commands to
     reproduce, worktree diffs pending integration, and unresolved questions.
   - Append one metrics line per finished job to the cross-run history (see
     "Metrics and Self-Improvement").

## Runtime Matrix

Before dispatching, read [runtime-matrix.md](references/runtime-matrix.md).
It records the current headless command shape and the documentation URLs checked
on 2026-07-05.

First-class (dispatch after the safety gate):

- `internal`: in-session subagent dispatch through the current harness's
  Agent tool — no subprocess, no extra CLI install. Agent selection, capture
  mapping, and limits per
  [internal-routing.md](references/internal-routing.md).
- `claude-code`: `claude -p` print mode with model, output format, and
  permission flags.
- `codex`: `codex exec` with model, working directory, sandbox, approval, JSON,
  and final-message output flags.
- `ak-run`: `ak run <kit>/<skill> --target <runtime> --timeout <duration>`.

External (best-effort; dispatch only after the preflight probe succeeds):

- `opencode` (`opencode run`), `copilot` (`copilot -p`), `cursor` (`agent -p`),
  `cline` (`cline "<prompt>"`), `qwen-code` (`qwen -p`), `grok` (`grok -p`),
  `kimi` (`kimi -p`), and `agy` (`agy -p`, doc-verified but execution-gated
  per ADR-0017).
- External status here is skill-level dispatch only; it does not change any
  runtime's AgentKit adapter status in the conformance matrix.

Not dispatchable: `gemini-cli` (rejected, ADR-0017); `omp` is provisional —
see the matrix before assigning it a job.

## Model Routing

Before assigning models, read
[model-routing.md](references/model-routing.md). Core rules:

- Route by task class: fast-cheap models for scouting/docs/mechanical fan-out,
  balanced models for implementation and tests, frontier models for
  architecture and review.
- Review, audit, and security jobs (including the arbiter) route to `gpt-5.5`
  first and fall back to `opus` when Codex is unavailable — never `fable` for
  this class. Among available fallbacks, prefer a different model family than
  the producers.
- `importance: high` implement jobs escalate to `opus` or `gpt-5.5` with
  raised reasoning effort (codex `-c model_reasoning_effort="high"`, `xhigh`
  where the model supports it).
- Never budget-route judgment jobs, never route to deprecated model IDs, and
  record the exact resolved model in each job's `command.txt`.

Runtime (harness) choice is a separate decision from model choice — weigh
sandboxing, tool gating, budgets, and capture quality per
[harness-profiles.md](references/harness-profiles.md).

Model routing applies to CLI runtimes only. `runtime: internal` jobs use the
model fixed by the agent's own definition (frontmatter); the coordinator picks
the agent, not the model. When a job needs a specific model, route it to a CLI
runtime instead.

## Worktree Isolation

- Setup per `isolation: worktree` job, before dispatch:
  `git worktree add <run-dir>/worktrees/<job-id> -b orchestrate/<run-id>/<job-id> <base-ref>`;
  the job's `cwd` becomes that worktree path.
- One job per worktree, never shared, never reused across attempts without a
  reset.
- Do not worktree-parallelize jobs that must edit the same generated artifact,
  lockfile, migration sequence, or shared config — worktrees defer that
  conflict to merge time instead of removing it. Sequence those jobs.
- Integration is coordinator-owned and happens only after the arbiter pass:
  summarize each worktree branch diff in the report; merging or cherry-picking
  is a separate reviewed step, never automatic.
- Cleanup: `git worktree remove` integrated or discarded worktrees; keep
  failed-job worktrees for diagnosis and list them in the report.

## Metrics and Self-Improvement

- Append one JSON line per finished job to
  `plans/reports/orchestrate-history.jsonl` (local corpus; non-markdown files
  under `plans/` stay untracked): run id, job id, runtime, model, task,
  duration ms, status, exit code, timed out, attempts, arbiter verdict, and
  token/cost figures when the harness reports them (claude-code JSON usage,
  opencode `step_finish` events).
- At report time, when the history holds enough rows for a runtime/model/task
  pair (roughly 20+), compare observed success rate, duration, and cost
  against the routing table.
- When observations contradict [model-routing.md](references/model-routing.md)
  or [harness-profiles.md](references/harness-profiles.md), add a "routing
  suggestions" section to the report with the evidence. Never silently edit
  the routing references mid-run — routing changes stay reviewable.

## Job Spec

Read [job-spec.md](references/job-spec.md) for the full schema. Minimal example:

```yaml
version: 1
concurrency: 2
jobs:
  - id: scout-session-api
    runtime: internal
    agent: Explore       # in-session subagent; omit to route per task class
    task: scout
    cwd: D:/www/claudekit/agentkit
    prompt: "Inspect the session API and report extension points."
    timeout: 10m
    expected_output: "Markdown report with files read and recommended seams."

  - id: codex-test-plan
    runtime: codex
    task: test           # routes to a balanced model (gpt-5.4)
    fallback_runtime: [claude-code]
    cwd: D:/www/claudekit/agentkit
    prompt: "Design focused tests for the session API extension."
    sandbox: workspace-write
    approval_policy: on-request
    timeout: 10m
    expected_output: "Markdown test plan with commands."
```

## Safety Defaults

- Every job needs an explicit `cwd`.
- Keep captured content under `plans/reports/orchestrate-<timestamp>/`.
- Redact tokens, API keys, cookies, private keys, and `.env` values from logs.
- Use `read-only` or `workspace-write` style permission boundaries first.
- Use destructive or permission-bypass flags only when the user explicitly opts
  in for that run.
- Bound each job with a timeout.
- Preserve failed job output for diagnosis; never hide it.
- Do not launch parallel jobs that edit the same files, generated artifacts,
  migrations, lockfiles, or shared config.
- Internal writing jobs follow the same parallel-write rule: worktree-isolate
  or sequence them. Keep `destructive: true` work off `runtime: internal`.

## Output Layout

```text
plans/reports/orchestrate-<timestamp>/
  jobs.yaml
  runtimes.json
  state.json
  report.md
  worktrees/
    <job-id>/
  <job-id>/
    command.txt         # CLI jobs only
    stdout.txt          # CLI jobs only
    stderr.txt          # CLI jobs only
    result.md           # internal jobs: subagent final text
    status.json
    artifacts/
    attempt-<n>/        # prior partial output preserved on resume
plans/reports/orchestrate-history.jsonl   # cross-run metrics corpus
```

`status.json` should include:

```json
{
  "id": "scout-session-api",
  "runtime": "claude-code",
  "model": "haiku",
  "task": "scout",
  "status": "success",
  "exitCode": 0,
  "durationMs": 12345,
  "timedOut": false,
  "attempts": 1,
  "worktree": null
}
```

## Arbiter Checklist

The final report is blocked until the arbiter answers:

- Did each job produce the requested artifact?
- Did any job fail, timeout, or emit an uncertainty marker?
- Do job outputs contradict each other?
- Were all listed checks run, and did they pass?
- Are claims supported by file paths, command output, citations, or tests?
- Are any destructive actions proposed but not approved?
- Are unresolved questions listed plainly?

## Failure Modes

- Missing runtime binary: re-route via `fallback_runtime` when set; otherwise
  mark the job `blocked` and continue only if other jobs do not depend on it.
- Missing internal agent: substitute per internal-routing.md (preferred →
  substitute → `general-purpose`); record the substitution in `status.json`.
  Re-route to `fallback_runtime` only when no internal agent fits.
- Unknown flag or model on an external runtime: fail the job, re-verify that
  runtime-matrix row against live docs, and never guess replacement flags.
- Authentication missing: do not ask for or log credentials; report the setup
  command or docs path needed.
- Permission prompt in non-interactive mode: stop that job and report the
  command requiring approval.
- Timeout: preserve partial output and mark the downstream jobs blocked.
- Sudden interruption (crash, power loss, killed session): `state.json` holds
  the last transition; rerun with `--resume <run-dir>` — completed jobs are
  skipped, in-flight jobs re-dispatch as a new attempt.
- Ambiguous file ownership: do not parallelize those jobs; if they must run in
  parallel anyway, isolate each in a worktree and resolve at integration.

## Limitations

- Each runtime starts with separate context; there is no shared memory between
  jobs.
- Internal jobs cannot be force-killed on timeout the way subprocesses can —
  the timeout marks the job failed for accounting, but a runaway subagent
  finishes on its own. Bound internal jobs by scoping the prompt, not by
  relying on the timeout.
- Internal-job isolation is prompt-level, not an OS sandbox; internal jobs
  consume the current session's token budget and run at its permission mode.
- Codex agent dispatch currently uses fresh `codex exec` subprocesses and may
  cold-start.
- Coding-agent CLI flags change; verify live docs before changing the runtime
  matrix. External rows are best-effort and drift faster than the first-class
  rows.
- Model catalogs move monthly; the routing table is a dated snapshot, not a
  guarantee.
- Worktree isolation needs a git repository and disk headroom; jobs outside a
  repo fall back to isolated `cwd` directories.
- The metrics history is advisory: routing-table changes always go through a
  human-reviewed edit, never an automatic rewrite.
- This skill coordinates humans and CLIs through documented commands. It does
  not add a new AgentKit scheduler daemon or dashboard surface.

## Completion Report

End with:

```markdown
**Orchestrate Result**
- Spec: <path or inline request>
- Report: <plans/reports/orchestrate-.../report.md>
- Jobs: <success>/<failed>/<blocked>
- Arbiter: pass|fail|blocked
- Checks: <commands or none>

Unresolved questions:
- None
```
