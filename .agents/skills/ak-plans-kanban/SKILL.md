---
name: ak:plans-kanban
description: Open the AgentKit plans dashboard in the CLI config UI. Use for plan kanban views, progress tracking, timeline checks, and quick navigation into plan files.
user-invocable: true
when_to_use: "Invoke to open or inspect the plans dashboard."
category: dev-tools
keywords: [plans, dashboard, kanban, progress, timeline]
argument-hint: "[deprecated flags are accepted with warnings]"
metadata:
  author: agentkit
  version: "2.0.0"
---

# plans-kanban

Thin launcher for the AgentKit CLI dashboard plans view.

It opens the integrated dashboard at `http://127.0.0.1:8766/plans` instead of starting the legacy standalone server.
If the dashboard is already running on another port, the launcher follows the URL reported by `ak config status --json`.

## Quick Start

```bash
node scripts/open-dashboard.cjs
```

If the dashboard is not already running, the launcher starts:

```bash
ak config start --port 8766 --no-open --no-interactive
```

Then it opens the plans route in your browser.

## Purpose

Use this skill when you want the visual plans dashboard for:
- Multi-plan kanban and grid views
- Timeline and progress overview
- Navigating into `plan.md` and `phase-*.md` files
- Quick visibility into active vs completed work

Scope note:
- Project dashboards should show project-scoped plans only.
- Global dashboards should show global-scoped plans only.
- Use `ak plan status` as the authoritative dependency/status view for `blockedBy` / `blocks`; `plans-kanban` is a launcher, not the source of cross-scope dependency truth.
- The generic `/plans` route defaults to `plans` unless a `dir` query param is already present; scope-aware plan roots come from the project/global dashboard context, not from deprecated launcher flags.

## Dashboard Workflow

```bash
# Open the plans dashboard
node scripts/open-dashboard.cjs

# Run the dashboard manually if you want to keep it in the foreground
ak config start --port 8766
```

Primary URL:

```text
http://127.0.0.1:8766/plans
```

## Deprecated Compatibility

The old standalone server flags are accepted for compatibility and replaced with guidance:

| Legacy input | Current behavior |
|-------------|------------------|
| `--dir <path>` / positional path | Warns and ignores. This launcher always opens the generic `/plans` route; it does not choose a custom plan root. |
| `--plans <path>` | Warns and ignores. |
| `--port <n>` | Warns and ignores. `plans-kanban` starts the AgentKit dashboard on `8766` and follows any already-running dashboard URL reported by `ak config status --json`. |
| `--host <addr>` | Warns and ignores. Use `ak config start --bind ...` directly if needed. |
| `--background` / `--foreground` | Warns and ignores. The launcher uses `ak config start` for lifecycle management. |
| `--stop` | Runs `ak config stop`. |
| `--open` | Accepted. Opening is now the default behavior. |

## Related CLI Commands

```bash
ak config start                 # Start dashboard
ak config start --port 8766     # Start on the plans-kanban default port
ak plan status <plan.md>        # Inspect plan progress from CLI
ak plan check /absolute/path/to/plan-dir/phase-01.md
ak plan uncheck /absolute/path/to/plan-dir/phase-01.md
```

## Requirements

### CLI Compatibility

The launcher performs a capability probe before opening the browser.
The dashboard at `/plans` is only opened when the running AgentKit CLI instance supports it, detected by either:

- `/api/health` response containing `"plans-dashboard"` in its `features` array, or
- `/api/plans` responding with a 2xx status (backward-compat for early dev builds).

If neither probe succeeds, the launcher prints an upgrade message and exits with code 1 without opening the browser. Upgrade the CLI to a version that exposes the plans-dashboard capability to use this launcher.

## Migration Notes

The legacy standalone server, renderer, and assets have been retired from this skill.

For migration details:

```text
deprecated/MIGRATION.md
```

## Troubleshooting

**`ak` not found**
Install the AgentKit CLI and confirm `ak --version` works in your shell, or set `AGENTKIT_CLI` to the local binary path.

**Dashboard did not open**
Start it manually with `ak config start --port 8766`, then open `/plans` on whichever port the CLI reports.

**Need to stop a launcher-started dashboard**
Run the launcher again with `--stop`, or run `ak config stop`.

**Need custom host or different port**
Run `ak config start` directly with the flags you need. The `plans-kanban` launcher intentionally stays thin and opinionated.
