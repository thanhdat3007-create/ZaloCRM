---
phase: 2
title: "Pipes, Collision, Scoring"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Pipes, Collision, Scoring

## Overview

Add scrolling pipe pairs with randomized vertical gaps, AABB collision detection
against the bird plus ground/ceiling, and a score that increments each time the
bird clears a pipe.

## Architecture

- `pipes`: array of `{ x, gapY, scored }`; each represents a top+bottom pipe pair sharing a gap of fixed height `GAP`.
- Spawn: push a new pipe when the rightmost pipe passes a horizontal spacing threshold; `gapY` randomized within safe margins.
- Update: move each pipe left by `PIPE_SPEED * dt`; cull pipes past the left edge.
- Collision: AABB between the bird's bounding box and each pipe's top/bottom rectangles; plus `bird.y` vs ground and ceiling.
- Scoring: when a pipe's right edge passes `bird.x` and `!pipe.scored`, increment `score`, set `scored = true`.

## Related Code Files

- Modify: `index.html` (pipe state, spawn/update/render, collision, score, HUD)

## Implementation Steps

1. Define pipe constants: `GAP`, `PIPE_WIDTH`, `PIPE_SPEED`, `SPACING`, gap min/max margins.
2. Implement spawn logic keyed off the last pipe's `x`; seed the first pipe(s).
3. In `update`, advance pipes, cull off-screen ones, and spawn as needed.
4. Render top and bottom pipe rectangles for each pair.
5. Implement AABB collision (bird box vs each pipe rect) and ground/ceiling checks → set a `dead` flag.
6. Implement per-pipe scoring; render current score as HUD text on the canvas.

## Success Criteria

- [ ] Pipes scroll leftward at constant speed with randomized, playable gaps
- [ ] Bird colliding with any pipe, the ground, or the ceiling sets the game to a dead/stopped state
- [ ] Score increments by exactly 1 per pipe cleared (no double counting)
- [ ] Off-screen pipes are removed (no unbounded array growth)

## Risk Assessment

- **Tunneling at high speed** → gaps/speed tuned so per-step movement is far smaller than `PIPE_WIDTH`; AABB per step is sufficient.
- **Double-scoring** → guarded by the `scored` flag per pipe.
- **Impossible gaps** → clamp `gapY` within margins so the gap is always reachable.
