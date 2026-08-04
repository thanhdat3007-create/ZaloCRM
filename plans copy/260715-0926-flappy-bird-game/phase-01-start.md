---
phase: 1
title: "Core Loop & Bird Physics"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Core Loop & Bird Physics

## Overview

Scaffold the single `index.html` file with a canvas, a fixed-timestep game loop,
and a bird that responds to gravity and flap input. This phase delivers a bird
that falls and can be flapped — no pipes yet.

## Requirements

- Functional: canvas renders; bird falls under gravity; flap (Space / click / touch) applies upward velocity.
- Non-functional: frame-rate-independent motion via fixed timestep accumulator; single self-contained file; runs by opening the file directly (`file://`).

## Architecture

- One `index.html`: inline `<style>`, `<canvas id="game">`, inline `<script>`.
- Fixed logical resolution (e.g. 400×600), canvas scaled with CSS; draw in logical units.
- Game loop: `requestAnimationFrame` driving an accumulator that steps physics at a
  fixed `dt` (e.g. 1/60s) and renders once per frame — decouples simulation from refresh rate.
- `bird` state: `{ y, velocity }`; constants `GRAVITY`, `FLAP_VELOCITY`, `bird.x` fixed.
- Input: `keydown` (Space), `mousedown`, `touchstart` → single `flap()` function.

## Related Code Files

- Create: `index.html` (canvas, styles, game loop, bird physics)

## Implementation Steps

1. Create `index.html` with meta viewport, centered canvas, dark background, inline script.
2. Set up canvas context and logical dimensions; helper to clear + draw background each frame.
3. Implement the fixed-timestep loop (accumulator + `requestAnimationFrame`), separating `update(dt)` and `render()`.
4. Add `bird` object; in `update`, apply gravity to velocity and velocity to `y`.
5. Wire `flap()` to Space / click / touch; render the bird as a simple shape (circle/rect).
6. Clamp/handle bird leaving top/bottom for now (no death yet — just don't let it vanish).

## Success Criteria

- [ ] Opening `index.html` shows the canvas and a visible bird
- [ ] Bird accelerates downward smoothly under gravity
- [ ] Space, click, and touch each make the bird flap upward
- [ ] Motion looks identical at 60Hz and 120Hz (fixed timestep verified)

## Risk Assessment

- **Frame-rate dependence** → mitigated by fixed-timestep accumulator, not raw `deltaTime` multiplication.
- **Blurry canvas on HiDPI** → optionally scale backing store by `devicePixelRatio`; acceptable to defer if visuals are fine.
