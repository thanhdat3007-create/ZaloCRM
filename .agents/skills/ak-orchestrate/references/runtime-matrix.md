# Runtime Matrix

Verified: 2026-07-05.

This matrix is the skill-level adapter contract for `/ak:orchestrate`. It
documents how to launch supported runtimes headlessly without adding a new
AgentKit CLI command or Go adapter interface.

## Support Tiers

| Tier | Runtimes | Contract |
| --- | --- | --- |
| First-class | `claude-code`, `codex`, `ak-run` | AgentKit production surfaces; dispatch without extra checks beyond the safety gate. |
| External | `opencode`, `copilot`, `cursor`, `cline`, `qwen-code`, `grok`, `kimi`, `agy` | Best-effort. Dispatch only after the preflight probe (`<binary> --version`) succeeds in the run environment. Flags drift fast — re-verify on failure. |
| Provisional | `omp` (oh-my-pi) | Known headless shape, but official docs are partially access-restricted; approval and budget flags unverified. Manual flag check required before dispatch. |
| Not dispatchable | `gemini-cli` (rejected, ADR-0017; individual tier EOL 2026-06-18) | Never assign jobs. Use `qwen-code`, `opencode`, or `copilot` for Gemini-family models instead. |

Timeout enforcement is coordinator-owned for every tier: bound each job with an
external process-level timeout and treat CLI-native budget flags (noted per row)
as defense-in-depth only.

## OS Awareness

Preflight records the host OS in `runtimes.json`; command shapes are the same
across OSes, but these differ:

- Install channels: `curl ... | bash` installers (opencode, grok, agy, cursor)
  assume a POSIX shell — on Windows use the documented PowerShell variant where
  one exists (cursor `irm 'https://cursor.com/install?win32=true' | iex`, qwen
  `install-qwen-standalone.ps1`, agy `install.ps1`, copilot
  `winget install GitHub.Copilot`) or npm (`opencode-ai`, `@github/copilot`,
  `cline`, `@qwen-code/qwen-code`); otherwise WSL/Git Bash is required.
- Sandbox strength: Codex sandbox enforcement is per-OS (macOS Seatbelt, Linux
  Landlock/seccomp) and weakest on Windows; Claude Code has no OS-level
  sandbox on Windows either. On Windows, compensate with tool
  allowlists/permission modes and prefer `isolation: worktree` for any writing
  job.
- Prompt passing: PowerShell quoting differs from POSIX. For multi-line or
  quote-heavy prompts, write the prompt to a file in the run dir and pass it
  via stdin or a prompt-file flag where the runtime supports it; never embed
  bash-isms in a Windows command line.
- External timeout mechanism: `timeout(1)` on Linux/macOS; a process kill after
  `Wait-Process -Timeout` (or equivalent) on Windows.
- Worktrees on Windows: long paths can exceed the 260-char limit under deep
  run dirs — set `git config core.longpaths true` or keep the run dir shallow.

## Claude Code (first-class)

Primary command:

```bash
claude -p "<prompt>" \
  --model sonnet \
  --output-format json \
  --allowedTools "Read,Edit"
```

Useful flags:

| Need | Flag |
| --- | --- |
| Non-interactive run | `-p`, `--print` |
| Model selection | `--model <model-or-alias>` |
| Structured output | `--output-format text|json|stream-json` |
| Tool pre-approval | `--allowedTools` / `--allowed-tools` |
| Deny tools | `--disallowedTools` / `--disallowed-tools` |
| Permission baseline | `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions` |
| Faster scripted startup | `--bare` |
| Max turns | `--max-turns <n>` |
| Continue a run | `--resume <session-id>` or `--continue` |

Safety notes:

- Prefer `--permission-mode plan`, `default`, or carefully scoped
  `--allowedTools`.
- Do not use `--dangerously-skip-permissions` unless the user explicitly opts
  in for that run.
- For CI-style calls, `--bare -p` reduces ambient hooks/plugins/MCP discovery.

Docs checked:

- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes

## Codex (first-class)

Primary command:

```bash
codex exec \
  --cd <cwd> \
  --model <model> \
  --sandbox workspace-write \
  --ask-for-approval on-request \
  --json \
  --output-last-message \
  "<prompt>"
```

Useful flags:

| Need | Flag |
| --- | --- |
| Headless run | `codex exec "<prompt>"` |
| Working directory | `--cd <path>` / `-C <path>` |
| Model selection | `--model <model>` / `-m <model>` |
| Sandbox | `--sandbox read-only|workspace-write|danger-full-access` |
| Approval policy | `--ask-for-approval untrusted|on-request|never` |
| Extra writable dir | `--add-dir <path>` |
| Config override | `--config key=value` / `-c key=value` |
| Machine-readable progress | `--json` |
| Final text capture | `--output-last-message` |

Safety notes:

- Prefer `--sandbox workspace-write --ask-for-approval on-request` for local
  unattended work that should stay inside the workspace.
- Use `--add-dir` for specific additional writable roots instead of
  `danger-full-access`.
- Avoid `--dangerously-bypass-approvals-and-sandbox` except inside an external
  sandbox VM.
- Codex sandboxing applies to spawned commands and differs by OS; Windows,
  Linux/WSL2, and macOS have different enforcement implementations.

Docs checked:

- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/concepts/sandboxing

## AgentKit Skill Run (first-class)

Use when the job should run an AgentKit skill rather than a free-form prompt:

```bash
ak run engineer/ak-research \
  --target claude-code \
  --timeout 10m \
  "Compare implementation options for the API layer."
```

Useful fields:

| Need | Flag |
| --- | --- |
| Runtime | `--target claude-code|codex` |
| Timeout | `--timeout <duration>` |
| Skill path | `<kit>/<skill>` |

Notes:

- `ak run` uses AgentKit's existing adapter seam.
- Use this row for reusable skills and free-form runtime rows for one-off
  isolated prompts.

## OpenCode (external)

Detect: `opencode --version`.

```bash
opencode run "<prompt>" \
  --model <provider/model> \
  --format json \
  --dir <cwd>
```

| Need | Flag |
| --- | --- |
| Model selection | `--model <provider/model>` (e.g. `anthropic/claude-sonnet-5`); list with `opencode models` |
| Structured output | `--format default|json` (JSONL events: `text`, `tool_use`, `step_finish` with token counts) |
| Working directory | `--dir <path>` |
| Unattended approvals | `--auto` (approves everything except explicit deny rules; `.env` reads denied by default) |
| Sessions | `opencode session list`, `opencode export <sessionID>` |

Safety notes:

- Provider-agnostic (75+ providers incl. Anthropic, OpenAI, Google, DeepSeek,
  local Ollama) — the best row for budget/open-weight model routing.
- No verified native timeout flag; rely on the coordinator's external timeout.
- Keep deny rules for `.env` and out-of-project paths intact when using
  `--auto`.

Docs checked: https://opencode.ai/docs/cli/, https://opencode.ai/docs/permissions/

## GitHub Copilot CLI (external)

Detect: `copilot version`.

```bash
copilot -p "<prompt>" \
  -C <cwd> \
  --model auto \
  --output-format json \
  --allow-tool read \
  --no-ask-user -s
```

| Need | Flag |
| --- | --- |
| Model selection | `--model=<id>` or `COPILOT_MODEL`; `auto` enables automatic selection; multi-vendor catalog (Claude, GPT, Gemini, Kimi) |
| Structured output | `--output-format text|json`; `-s` / `--silent` for response-only |
| Working directory | `-C <directory>` |
| Tool allowlist | `--allow-tool=<tool>` (shell, write, read, url, memory, MCP) / `--deny-tool=<tool>` |
| Non-interactive | `--no-ask-user` |
| Transcript export | `--share=<path>` |

Safety notes:

- `--allow-all-tools` is the bypass boundary — only with explicit user opt-in.
- Prefer per-tool `--allow-tool` grants; deny `shell` and `write` for read-only
  jobs.
- Requires an active Copilot subscription; rate limits per tier.

Docs checked:
https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference,
https://docs.github.com/en/copilot/reference/ai-models/supported-models

## Cursor CLI (external)

Detect: `agent --version` (binary is `agent`; auth via `CURSOR_API_KEY`).

```bash
agent -p "<prompt>" --output-format json
```

| Need | Flag |
| --- | --- |
| Structured output | `--output-format text|json`; `--stream-partial-output` for deltas |
| Sessions | `agent ls`, `agent resume` / `--resume [id]` |
| Write access | `--force` (print mode does not modify files without it) |

Safety notes:

- `--force` is the bypass boundary for file edits — treat like a destructive
  opt-in.
- Model flag and working-directory flag are UNVERIFIED in official docs; run
  from the job `cwd` and verify `agent --help` before pinning a model.

Docs checked: https://cursor.com/docs/cli/headless, https://cursor.com/docs/cli/using

## Cline (external)

Detect: `cline --version` (install: `npm install -g cline` or `brew install
cline`; winget/curl installers unverified).

```bash
cline -c <cwd> \
  -m <provider/model> \
  --json \
  -t 600 \
  "<prompt>"
```

| Need | Flag |
| --- | --- |
| Model selection | `-m <provider/model>`; provider via `-P <id>` (default `cline` managed) |
| Structured output | `--json` (NDJSON stream) |
| Working directory | `-c, --cwd <path>` |
| Timeout | `-t, --timeout <seconds>` — native, but default `0` = none, so always set it |
| Command gating | `CLINE_COMMAND_PERMISSIONS` env: JSON allow/deny glob patterns for shell commands |
| Sessions | `cline history`, `--id <session-id>` |
| Rules | `.clinerules` file or directory; `AGENTS.md` also recognized |

Model access modes (route per [model-routing.md](model-routing.md)):

- Managed: `-P cline` usage-billing (pay-as-you-go across vendors) or the
  ClinePass subscription (selected open coding models with raised rate
  limits).
- BYOK via `cline auth <provider>`: Anthropic, OpenAI, Gemini, OpenRouter,
  Bedrock, Cerebras, Groq, and OpenAI-compatible endpoints.

Safety notes:

- Headless (non-TTY) runs default to auto-approve enabled — same posture as
  Kimi. Give Cline jobs read/report work or an isolated `cwd`/worktree, and
  set `CLINE_COMMAND_PERMISSIONS` deny globs for destructive commands.
- `--yolo` / `-y` skips every approval — bypass boundary, never by default.

Docs checked: https://docs.cline.bot/cli/cli-reference,
https://docs.cline.bot/features/auto-approve,
https://docs.cline.bot/getting-started/clinepass

## Qwen Code (external)

Detect: `qwen --version`.

```bash
qwen -p "<prompt>" \
  -m <model-id> \
  --output-format json \
  --max-wall-time 10m \
  --max-tool-calls 25
```

| Need | Flag |
| --- | --- |
| Model selection | `-m <id>` from configured `modelProviders` (Qwen, OpenAI-compatible, Anthropic, Gemini, Vertex) |
| Structured output | `--output-format text|json|stream-json` |
| Budgets | `--max-wall-time <duration>`, `--max-tool-calls <n>` (exit code 55 on breach; top-level calls only) |
| Sessions | `--continue`, `--resume [sessionId]` |

Safety notes:

- `--yolo` / `-y` auto-approves with NO sandboxing — bypass boundary, never by
  default.
- No verified cwd flag; invoke from the job `cwd`.
- The only external row with native wall-time budgets — still keep the external
  timeout as the authority.

Docs checked: https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/

## Grok CLI (external)

Detect: `grok --version` (xAI Grok Build, public beta since 2026-05).

```bash
grok -p "<prompt>" \
  -m grok-build-0.1 \
  --output-format json \
  --no-auto-update
```

| Need | Flag |
| --- | --- |
| Model selection | `-m <model>`; default `grok-build-0.1` |
| Structured output | `--output-format plain|json|streaming-json` |
| Sessions | `-c` / `--continue`, `-s <session-id>` |
| Scripted runs | `--no-auto-update` skips update checks in CI |

Safety notes:

- `--always-approve` is the bypass boundary — never by default.
- Per-tool timeouts configurable in `.grok/config.toml`; headless turn limit is
  UNVERIFIED — rely on the external timeout.
- Beta runtime: prefer first-class rows for load-bearing jobs.

Docs checked: https://docs.x.ai/build/cli/headless-scripting

## Kimi Code CLI (external)

Detect: `kimi --version`.

```bash
kimi -p "<prompt>" \
  -m kimi-for-coding \
  --output-format stream-json
```

| Need | Flag |
| --- | --- |
| Model selection | `-m <model>`; default `kimi-for-coding` (K-series coding profile) |
| Structured output | `--output-format text|stream-json` (thinking/progress on stderr, replies on stdout) |
| Budgets | config `[loop_control] max_steps_per_turn` (default 100); subagent timeout fixed 30m |

Safety notes:

- `-p` forces the auto permission policy and cannot be combined with `--yolo`,
  `--auto`, or `--plan` — every headless Kimi job is effectively auto-approved,
  so give Kimi jobs read/report work or an isolated `cwd`, not shared-tree
  writes.
- Config home `~/.kimi-code/`; project overrides in `.kimi-code/local.toml`.

Docs checked: https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html

## Antigravity / agy (external — doc-verified, execution-gated)

Detect: `agy --version`; list models with `agy models`.

```bash
agy -p "<prompt>" --model "Gemini 3.5 Flash (Medium)"
```

| Need | Flag |
| --- | --- |
| Model selection | `--model "<name>"` (Gemini 3.5 Flash/Pro tiers, Claude Sonnet); `agy models` lists |
| Non-interactive | `-p` |

Safety notes:

- `--dangerously-skip-permissions` is the bypass boundary — never by default.
- Output format, cwd flag, and timeout controls are UNVERIFIED; first-launch
  Google OAuth is interactive, so preflight must confirm the CLI is already
  authenticated before scheduling jobs.
- ADR-0017 keeps `agy` blocked as an AgentKit *adapter*; this row is
  skill-level dispatch only and inherits that caution.

Docs checked: https://antigravity.google/cli/install,
https://codelabs.developers.google.com/antigravity-cli-hands-on

## Provisional: oh-my-pi (`omp`)

Known shape: `omp --no-session -p "<prompt>"` with `--mode json` for JSONL
events and `--model <name>` against `~/.omp/agent/models.yml` (40+ providers).
Approval and budget flags are UNVERIFIED because official docs are partially
access-restricted. Before assigning a job, run `omp --help` and confirm the
approval behavior; otherwise route the job to `opencode` (similar
provider-agnostic coverage, verified flags).

## Verification Rule

Before changing command examples, check the official docs again and update the
verified date. Runtime CLI flags move quickly, and stale orchestration examples
are worse than no example. When a preflight probe or dispatch fails on a flag
error, re-verify that row against live docs before retrying — never guess
flags.
