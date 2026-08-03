# Workflow Routing

Use this file when choosing the sequence for multi-step work. It is a routing
map only; load the owning `SKILL.md` before executing details.

## Core Sequences

| User intent | Sequence |
|---|---|
| Implement a feature | `the engineer plan skill` -> `/ak:cook` -> `the installed test skill` -> `the installed code-review skill` |
| Execute an existing plan | `/ak:cook <plan-path>` |
| Quick implementation | `/ak:cook --fast` |
| Bug, error, failed test, or CI failure | `/ak:fix` |
| Investigate before deciding | `/ak:scout` -> `the engineer debug skill` -> `/ak:brainstorm` -> `the engineer plan skill` |
| Review a PR | `the installed review-pr skill <PR>` |
| Fix review feedback | `the installed review-pr skill <PR> --fix` or `/ak:fix --parallel` |
| Ship a completed branch | `the engineer ship skill` |
| Explain work visually | `/ak:preview --explain` or `/ak:preview --html --diff` |
| Update project docs | `/ak:docs update` |

## Implementation Owner

- Use `/ak:cook` for known feature scope after requirements are clear.
- Use `/ak:fix` for concrete bugs, errors, test failures, and CI failures.
- Use `the engineer plan skill` when work needs architecture, phases, file ownership, or TDD
  structure.
- Use `the installed test skill` for verification-only work.
- Use `the engineer ship skill` only after implementation, tests, and review are done.

## Handoff Rules

- Domain skill first, workflow skill second. Example: for a React feature,
  route to `the installed frontend-development skill`, then execute through `the engineer plan skill` and
  `/ak:cook` if implementation is needed.
- For visual explanations, load
  `../../preview/references/visual-explanation-routing.md`.
- For documentation changes, load
  `../../docs/references/documentation-management.md` or invoke
  `/ak:docs update`.
- If `find-skills` is installed and skill choice is ambiguous, load
  `../../find-skills/references/domain-routing.md`. Otherwise use the installed
  skill names and descriptions.

## Post-Implementation

- Review high-risk, cross-module, or public-contract changes before shipping.
- Update docs only when behavior, setup, commands, architecture, security
  posture, public contracts, or future maintainer decisions changed.
- Journal when a workflow creates durable decisions or debugging lessons.
