---
name: ak:docs
description: "Analyze codebase and manage project documentation. Use for doc initialization, updates, summaries, codebase analysis."
user-invocable: true
when_to_use: "Invoke to create, refresh, or audit project documentation."
category: utilities
keywords: [documentation, init, update, summarize]
argument-hint: "init|update|summarize"
metadata:
  author: agentkit
  version: "1.2.0"
---

# Documentation Management

Analyze codebase and manage project documentation through scouting, analysis, and structured doc generation.

**IMPORTANT:** Invoke "the engineer project-organization skill" skill to organize the outputs.

## Default (No Arguments)

If invoked without arguments, use `ask_user capability` to present available documentation operations:

| Operation | Description |
|-----------|-------------|
| `init` | Analyze codebase & create initial docs |
| `update` | Analyze changes & update docs |
| `summarize` | Quick codebase summary |

Present as options via `ask_user capability` with header "Documentation Operation", question "What would you like to do?".

## Subcommands

| Subcommand | Reference | Purpose |
|------------|-----------|---------|
| `/ak:docs init` | `references/init-workflow.md` | Analyze codebase and create initial documentation |
| `/ak:docs update` | `references/update-workflow.md` | Analyze codebase and update existing documentation |
| `/ak:docs summarize` | `references/summarize-workflow.md` | Quick analysis and update of codebase summary |

## Routing

Parse `$ARGUMENTS` first word:
- `init` → Load `references/init-workflow.md`
- `update` → Load `references/update-workflow.md`
- `summarize` → Load `references/summarize-workflow.md`
- empty/unclear → ask_user capability (do not auto-run `init`)

If another workflow needs to decide whether docs should be touched before
invoking docs operations, load `references/documentation-management.md`.

## Shared Context

Documentation lives in `./docs` directory:
```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

Use `docs/` directory as the source of truth for documentation.

When authoring or refreshing diagrams in `system-architecture.md`, apply `/ak:tech-graph`'s SVG layout rules for component spacing, arrow routing, label placement, and z-index ordering. Pair with `/ak:preview --diagram` for visual self-review, or use `/ak:tech-graph` directly for publish-grade output.

**IMPORTANT**: **Do not** start implementing code.
