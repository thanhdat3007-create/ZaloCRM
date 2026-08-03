# Harness Profiles

Verified: 2026-07-05. Facts come from the runtime-matrix doc checks; judgment
notes are coordinator guidance, not benchmarks.

Model routing ([model-routing.md](model-routing.md)) picks the model for a
task; this file picks the *harness*. Weigh, in order: (1) write-safety controls
the job needs, (2) model reachability, (3) budget enforcement, (4) capture
quality for metrics.

## internal (harness Agent tool)

- Pros: zero install and zero cold start — works when no other CLI exists;
  dispatches the machine's installed specialized agents (pre-tuned system
  prompts and tool allowlists); cheapest row for scout/review/docs fan-out.
- Cons: no per-job model choice (agent definition owns the model); no OS
  sandbox or per-job approval flags — runs at the session's permission mode
  with prompt-level isolation only; timeouts are accounting-only (no force
  kill); consumes the current session's token budget; no
  stdout/stderr/exit-code capture (final text → `result.md`).
- Best for: read-heavy fan-out (scout, research, docs), reviews when codex is
  unavailable, and worktree-isolated light implementation. Keep
  `destructive: true` and model-pinned jobs on CLI rows. Details:
  [internal-routing.md](internal-routing.md).

## claude-code

- Pros: strongest permission surface (per-tool allow/deny plus permission
  modes incl. `plan`); mature `json`/`stream-json` capture; session resume
  (`--resume`, `--continue`); `--bare` trims scripted startup; `--max-turns`
  native budget; frontier judgment models.
- Cons: premium cost at frontier tiers; ambient hooks/plugins/MCP discovery
  slows non-`--bare` startup.
- Best for: judgment-heavy jobs, complex implementation, the arbiter, any job
  needing scoped write permissions without a worktree.

## codex

- Pros: OS-level sandbox applies to spawned commands (`read-only`,
  `workspace-write`); clean final capture via `--output-last-message`; `--json`
  event stream; `--cd` explicit cwd.
- Cons: ~1-3s cold start per `codex exec`; sandbox enforcement differs by OS
  (weakest coverage on Windows); fully unattended runs need
  `--ask-for-approval never`, which loosens the approval gate.
- Best for: sandboxed implementation and test runs inside the workspace;
  review/audit/security jobs (gpt-5.5 routing preference).

## ak-run

- Pros: reuses the AgentKit adapter seam; native `--timeout`; jobs get the
  full skill content (references included), not a bare prompt.
- Cons: limited to installed kits/skills and `--target claude-code|codex`.
- Best for: any job that matches an existing kit skill — prefer it over
  re-prompting the same procedure.

## opencode

- Pros: provider-agnostic (75+ providers incl. local Ollama) — the reach row
  for DeepSeek/GLM/open-weight budget routing; deny rules stay enforced under
  `--auto` (`.env` denied by default); JSONL `step_finish` events carry token
  counts and cost — the best external row for metrics capture.
- Cons: no verified native timeout; headless session resume weaker than
  first-class rows.
- Best for: cost-routed fan-out (scout/docs/mechanical) on cheap or local
  models, with per-step cost telemetry.

## copilot

- Pros: granular per-tool `--allow-tool`/`--deny-tool`; multi-vendor model
  catalog (Claude, GPT, Gemini, Kimi) plus `--model auto`; explicit `-C` cwd;
  `--share` transcript export.
- Cons: subscription-gated with per-tier rate limits; no verified session
  resume; no native time budget.
- Best for: reaching another vendor's model with tight tool gating when the
  native CLI for that vendor is not installed.

## cursor

- Pros: streaming partial output; session list/resume.
- Cons: all-or-nothing write gate (`--force`, no per-tool grants); model and
  cwd flags unverified.
- Best for: read-only analysis fan-out. Avoid write jobs unless
  worktree-isolated.

## cline

- Pros: native per-run timeout (`-t <seconds>`) plus NDJSON output — the
  best-bounded external row alongside qwen-code; widest model access modes
  (managed usage-billing, ClinePass flat-rate open coding models, BYOK across
  8+ providers); `CLINE_COMMAND_PERMISSIONS` glob-level command gating is
  finer than any other external row; explicit `-c` cwd; session resume by id.
- Cons: headless runs default to auto-approve (writes allowed without
  prompts); default timeout is 0/none unless set; winget/curl install paths
  unverified.
- Best for: budget implementation and mechanical volume on open/BYOK models,
  with deny-glob command gating and worktree-isolated writes. ClinePass makes
  it the predictable-cost row for large mechanical batches.

## qwen-code

- Pros: best native budgets of any row (`--max-wall-time`, `--max-tool-calls`,
  exit 55 on breach); `stream-json`; `--continue`/`--resume`.
- Cons: `--yolo` approves everything with no sandbox (all-or-nothing); cwd
  flag unverified.
- Best for: bounded batch/scout jobs on Qwen-family models where a hard
  wall-time is worth more than sandboxing.

## grok

- Pros: cheap fast tier (`grok-code-fast-1`); session flags; `--no-auto-update`
  for CI hygiene; per-tool timeouts via config.
- Cons: beta runtime; headless turn limit unverified; `--always-approve` is
  all-or-nothing.
- Best for: cheap scouting volume. Keep off load-bearing jobs while beta.

## kimi

- Pros: token-efficient coding profile; step budgets via `[loop_control]`
  config.
- Cons: headless `-p` is always auto-approved — the weakest safety posture in
  the matrix; one-shots are stateless (no resume).
- Best for: read/report jobs, or mechanical writes strictly inside a worktree
  or isolated cwd. Never on a shared tree.

## agy

- Pros: Gemini tier selection incl. reasoning levels; `agy models` discovery.
- Cons: execution-gated (interactive first-launch OAuth); output format, cwd,
  and timeout flags unverified; blocked as an AgentKit adapter (ADR-0017).
- Best for: nothing load-bearing yet; pair any agy job with a first-class
  verification job.

## Harness Enablement

A harness performs best with its rules file and skills installed before
dispatch. Preflight checks these; installing or updating them is a visible
setup step, never a silent side effect.

| Runtime | Rules file auto-loaded | Skills discovery |
| --- | --- | --- |
| claude-code | `CLAUDE.md` | `~/.claude/skills/`, project `.claude/skills/` |
| codex | `AGENTS.md` (global: `~/.codex/AGENTS.md`) | `~/.agents/skills/`, project `.agents/skills/` |
| opencode | `AGENTS.md` | project `.agents/skills/`, `.opencode/skills/`, `~/.claude/skills/` |
| cursor | `.cursor/rules/*.mdc` or `AGENTS.md` | UNVERIFIED |
| copilot | `AGENTS.md`, `.github/copilot-instructions.md` | UNVERIFIED |
| cline | `.clinerules` (file or dir); `AGENTS.md` recognized | UNVERIFIED |
| qwen-code | `AGENTS.md` | `.qwen/skills/`, `~/.qwen/skills/` |
| grok | `AGENTS.md` (merged git-root → cwd), `AGENTS.override.md` | UNVERIFIED |
| kimi | `AGENTS.md` | UNVERIFIED |
| agy | UNVERIFIED | UNVERIFIED |

- Install or refresh AgentKit kit content per runtime with
  `ak kit init <kit> --target claude-code|codex [--global]` and
  `ak update --kits <kit>`; installed-plugin refresh stays explicit via
  `ak kit init <kit> --force`. A project-level codex-target install writes the
  flat `.agents/skills/` projection plus `AGENTS.md`, which opencode discovers
  verbatim and most other external rows can read as rules context.
- Keep the repo-root `AGENTS.md` compact — nearly every row loads it natively,
  so it is the cheapest cross-harness lever for output quality.
- Prompt contract: every job prompt names the skill(s) the agent should use
  for its task type with the concrete path (e.g. "Use the ak-test skill —
  read .agents/skills/ak-test/SKILL.md first") and states the expected
  output. Do not rely on auto-discovery to trigger the right skill in a
  headless one-shot.

## Cross-Cutting Rules

- All-or-nothing write harnesses (kimi headless, cline headless, qwen
  `--yolo`, cursor `--force`, grok `--always-approve`) may write only inside a
  worktree or isolated `cwd`; for cline also set `CLINE_COMMAND_PERMISSIONS`
  deny globs.
- Prefer the harness with native budgets when the job risks runaway loops;
  otherwise the coordinator's external timeout is the only stop.
- Prefer harnesses with token/cost telemetry (opencode, claude-code json) for
  jobs feeding the metrics history, so routing suggestions rest on real cost
  data.
- Beta or execution-gated rows never carry a job whose failure blocks the rest
  of the run.
