---
phase: 3
title: "Game States & Polish"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Game States & Polish

## Overview

Wrap the core into a proper state machine (ready → playing → game-over), add
restart, persist a high score in `localStorage`, and apply light visual polish.

## Architecture

- `state`: one of `'ready' | 'playing' | 'gameover'`.
  - `ready`: bird idle/hovering, "Tap to start" prompt; first flap → `playing`.
  - `playing`: full physics + pipes active.
  - `gameover`: freeze pipes, show score + high score + "Tap to restart"; input resets and returns to `ready`/`playing`.
- `reset()`: clears pipes, recenters bird, zeroes score.
- High score: read/write `localStorage['flappyHighScore']`; update on game over when beaten.
- Polish: simple parallax/ground strip, bird rotation tied to velocity, flap tint — all optional and cheap.

## Related Code Files

- Modify: `index.html` (state machine, reset, localStorage, overlays, polish)

## Implementation Steps

1. Introduce the `state` variable; gate `update`/input handling on it.
2. Add ready-screen prompt and gameover overlay drawing (score, high score, restart hint).
3. Implement `reset()` and wire input transitions between all three states.
4. Load high score on start; on game over, persist `max(score, stored)`.
5. Add cheap polish: ground strip, bird tilt by velocity, subtle color. Keep it minimal.
6. Final manual playtest pass across the acceptance checklist.

## Success Criteria

- [ ] Game starts on a ready screen and begins on first input
- [ ] Game over shows final score and persisted high score; restart works without page reload
- [ ] High score survives a browser reload
- [ ] Full loop (start → play → die → restart) is smooth with no console errors

## Risk Assessment

- **localStorage unavailable** (`file://` / privacy mode) → wrap access in try/catch; fall back to in-memory high score.
- **Input carrying over between states** → transitions consume the input event so a death tap doesn't instantly restart-and-flap.
- **Polish scope creep** → polish is explicitly optional; ship the working loop first.
