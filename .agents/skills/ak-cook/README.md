# Cook Skill

End-to-end feature implementation with smart intent detection.

## Usage

```bash
/ak:cook <natural language task OR plan path>
```

The skill automatically detects your intent and routes to the appropriate workflow.

## Examples

```bash
# Interactive mode (default)
/ak:cook implement user authentication

# Execute existing plan
/ak:cook plans/260120-auth

# Fast mode (skip research)
/ak:cook quick fix for login bug
/ak:cook implement feature --fast

# Auto mode (trust me bro)
/ak:cook implement dashboard trust me
/ak:cook implement feature --auto

# Parallel mode (multi-agent)
/ak:cook implement auth, payments, notifications
/ak:cook implement feature --parallel

# No-test mode
/ak:cook implement feature --no-test

# TDD mode (composable with any workflow)
/ak:cook refactor auth middleware --tdd
/ak:cook plans/260120-auth/phase-02-api.md --tdd
```

## Modes

| Mode | Research | Testing | Review | Use Case |
|------|----------|---------|--------|----------|
| interactive | ✓ | ✓ | User approval | Default, full control |
| auto | ✓ | ✓ | Auto if score≥9.5 | Trusted, hands-off |
| fast | ✗ | ✓ | Simplified | Quick fixes |
| parallel | Optional | ✓ | User approval | Multi-feature work |
| no-test | ✓ | ✗ | User approval | Speed priority |
| code | ✗ | ✓ | User approval | Existing plans |

## Intent Detection

The skill detects mode from:
1. **Explicit flags:** `--interactive`, `--fast`, `--auto`, `--parallel`, `--no-test`
   - `--tdd` is composable and does not change the detected mode
2. **Plan paths:** `./plans/*`, `plan.md`, `phase-*.md`
3. **Keywords:** "fast", "quick", "trust me", "auto", "no test"
4. **Feature count:** 3+ features → parallel mode

## Workflow

```
[Intent Detection] → [Research?] → [Plan] → [Implement] → [Test?] → [Review] → [Finalize]
```

## Files

```
cook/
├── SKILL.md                           # Main skill definition
├── README.md                          # This file
└── references/
    ├── intent-detection.md            # Detection rules
    ├── workflow-steps.md              # Step definitions
    ├── review-cycle.md                # Review process
    └── subagent-patterns.md           # Subagent usage
```

## Version

2.1.1 - Added `--tdd` guidance and stronger implementation conformance rules
2.1.0 - Review gates added for human-in-the-loop mode
2.0.0 - Smart intent detection (hybrid approach)
