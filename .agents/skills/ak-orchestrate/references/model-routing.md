# Model Routing

Verified: 2026-07-05.

How the coordinator picks a runtime and model for each job when the spec sets
`task:` instead of pinning `model:`. Goal: cheapest model that reliably
produces the expected output, with frontier capacity reserved for synthesis and
judgment.

Scope: CLI runtimes only. `runtime: internal` jobs take the model fixed by the
subagent's own definition — the coordinator routes by picking the agent per
[internal-routing.md](internal-routing.md), never by setting a model. A job
that must run on a specific model routes to a CLI runtime.

## Routing Rules

1. If a job pins `model:`, use it verbatim. Otherwise classify the job into one
   task class below and take the strongest available runtime's primary model.
2. Fan-out cheap, synthesize frontier: parallel scout/report jobs get the
   fast-cheap tier; the job that merges or decides gets the frontier tier.
3. Review, audit, and security jobs route to `gpt-5.5` (codex) first —
   maintainer preference; never use `fable` for this class. If Codex is
   unavailable, fall back to `opus` (claude-code). When several options are
   available, prefer a model family different from the one that produced most
   of the outputs under review — same-family review inherits the producer's
   blind spots.
4. Prefer stable aliases over pinned snapshots where the runtime offers them:
   `claude --model sonnet|opus|haiku`, `copilot --model auto`. Pin exact IDs
   only when reproducibility matters, and record the ID in `command.txt`.
5. Never route to deprecated IDs. Known as of the verified date:
   `gpt-5.2`, `gpt-5.3-codex` (deprecated); `deepseek-chat`, `deepseek-reasoner`
   (EOL 2026-07-24); `gemini-cli` as a runtime (rejected, ADR-0017).
6. Beta runtimes/models (Grok Build, agy) never carry load-bearing jobs alone;
   pair them with a first-class job or route their output through the arbiter.
7. Importance escalation for `implement`: jobs marked `importance: high`
   (public contracts, security-sensitive paths, cross-module or hard-to-revert
   changes) skip the balanced tier and take `opus` (claude-code) or codex
   `gpt-5.5` with raised reasoning effort — see "Reasoning-Effort Controls".
   When in doubt whether a job is high-importance, escalate; the cost delta is
   smaller than a re-run.

## Task-Class Table

Tiers: **frontier** (deep reasoning, accept latency/cost), **balanced**
(implementation-grade), **fast-cheap** (volume work).

| Task class (`task:`) | Tier | claude-code | codex | Budget / alt (external rows) |
| --- | --- | --- | --- | --- |
| `scout` — locate/search/summarize code | fast-cheap | `haiku` | `gpt-5.4-mini` | `grok-code-fast-1` (grok); `gemini-3.1-flash-lite` via opencode/copilot |
| `architecture` — design, trade-offs, deep reasoning | frontier | `fable` (or `opus`) | `gpt-5.5` | `qwen3-coder-480b-a35b` (qwen-code); `glm-5` via opencode |
| `implement` — feature code, refactors with judgment | balanced; rule 7 escalates `importance: high` to `opus` / `gpt-5.5` + high effort | `sonnet` | `gpt-5.4` | `gemini-3.5-flash` via copilot; `deepseek-v4-flash` via opencode/cline |
| `review` (aliases: `audit`, `security`) — code review, security audit, arbiter, conflict judging | frontier; `gpt-5.5` first per rule 3 | `opus` (fallback; never `fable`) | `gpt-5.5` (primary) | none — do not budget-route judgment |
| `test` — test design and generation | balanced | `sonnet` | `gpt-5.4` | `qwen3-coder-480b-a35b` (qwen-code) |
| `docs` — summaries, reports, doc updates | fast-cheap | `haiku` | `gpt-5.4-mini` | `gemini-3.1-flash-lite` via copilot |
| `mechanical` — bulk repetitive edits, formatting | fast-cheap | `haiku` | `gpt-5.4-mini` | `deepseek-v4-flash` via opencode; `kimi-for-coding` (kimi) |

`opusplan` (Claude Code hybrid: Opus plans, Sonnet implements) is a good
single-job compromise when one job spans `architecture` + `implement`.

## Runtime Model Catalogs (snapshot)

Names drift — before pinning, confirm with the runtime's own listing
(`claude --help`, `codex -m` docs, `opencode models`, `copilot /models`,
`agy models`) or the provider docs below.

| Runtime | Frontier | Balanced | Fast-cheap |
| --- | --- | --- | --- |
| claude-code | `fable` (claude-fable-5), `opus` (claude-opus-4-8) | `sonnet` (claude-sonnet-5) | `haiku` (claude-haiku-4-5) |
| codex | `gpt-5.5` | `gpt-5.4` | `gpt-5.4-mini` |
| copilot | `claude-opus-4-8`, `gpt-5.5` | `claude-sonnet-5`, `gemini-3.5-flash` | `claude-haiku-4-5`, `kimi-k2.7-code`; or `auto` |
| opencode | any `provider/model` (75+ providers) | — | best row for `deepseek-v4-flash`, GLM, local Ollama |
| qwen-code | `qwen3-coder-480b-a35b` | `qwen3-coder-next` | provider-configurable |
| grok | `grok-4.3` (general) | `grok-build-0.1` (coding, beta) | `grok-code-fast-1` |
| kimi | — | `kimi-for-coding` (K2.7 profile) | same |
| cursor | vendor catalog (Claude/GPT/Gemini/Composer); model flag UNVERIFIED — check `agent --help` | | |
| cline | BYOK any `provider/model` (Anthropic, OpenAI, Gemini, OpenRouter, Bedrock, Groq, ...) | managed `-P cline` usage-billing | ClinePass subscription (selected open coding models, raised rate limits) — best flat-cost row for mechanical volume |
| agy | `Gemini 3.5 Pro (High)` | `Gemini 3.5 Flash (Medium)`, `Claude Sonnet` | `Gemini 3.5 Flash (Low)` |

## Reasoning-Effort Controls

For rule 7 escalations (and frontier `architecture`/`review` jobs where depth
matters more than latency):

- codex: `-c model_reasoning_effort="high"` (values: minimal, low, medium,
  high, xhigh; `xhigh` is model-dependent — verify before pinning it).
- claude-code: `opus` defaults to high effort; current adaptive-thinking
  models (Sonnet 5, Opus 4.7+) manage their own budget. For older
  non-adaptive models only, `MAX_THINKING_TOKENS` raises the thinking budget.
- Other runtimes: no verified headless reasoning-effort control — escalate by
  picking a stronger model instead.

## Worked Example

"Audit the settings API, then implement the agreed fix and review it":

| Job | task | Route |
| --- | --- | --- |
| scout-settings | `scout` | claude-code `haiku` |
| design-fix | `architecture` | claude-code `fable`, `depends_on: [scout-settings]` |
| implement-fix | `implement` | claude-code `sonnet`, `depends_on: [design-fix]` |
| review-fix | `review` | codex `gpt-5.5` (review default per rule 3; cross-family vs the Claude producer), `depends_on: [implement-fix]` |

## Provider Docs Checked

- https://platform.claude.com/docs/en/about-claude/models/overview
- https://code.claude.com/docs/en/model-config
- https://developers.openai.com/codex/models
- https://ai.google.dev/gemini-api/docs/models
- https://docs.x.ai/developers/models
- https://platform.moonshot.ai/docs/models
- https://docs.github.com/en/copilot/reference/ai-models/supported-models
- https://www.alibabacloud.com/help/en/model-studio/qwen-coder
- https://api-docs.deepseek.com/

Re-verify and bump the date whenever a route fails on an unknown-model error.
