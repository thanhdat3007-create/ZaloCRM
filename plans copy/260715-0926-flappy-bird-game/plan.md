---
title: "Flappy Bird Game"
description: "Single-file HTML5 canvas Flappy Bird clone in vanilla JS — no build step, runs in any browser."
status: pending
priority: P1
effort: "3-4h"
tags: [game, canvas, vanilla-js]
created: 2026-07-15
---

# Flappy Bird Game

## Overview

A playable Flappy Bird clone as a **single self-contained `index.html`** file:
HTML5 `<canvas>` + vanilla JavaScript, no dependencies, no build step. Tap /
click / spacebar to flap; navigate the bird through gaps between scrolling pipes;
score increments per pipe passed; collision ends the game with a restart prompt.
High score persists in `localStorage`.

**Stack decision:** Vanilla JS + Canvas 2D, one file. Rationale (KISS/YAGNI): the
game is small, needs zero tooling, and one HTML file is the most portable, easiest
to run and share. No framework or asset pipeline warranted.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Playable core loop: bird gravity + flap physics on a fixed-timestep game loop | P1 |
| 2 | Scrolling pipes with gap generation, AABB collision, and per-pipe scoring | P1 |
| 3 | Game states (ready / playing / game-over), restart, persistent high score, basic polish | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Core Loop & Bird Physics](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Pipes, Collision, Scoring](./phase-02-pipes-collision-scoring.md) | Pending |
| 3 | [Phase 3: Game States & Polish](./phase-03-game-states-and-polish.md) | Pending |

## Success Criteria

- [ ] Opening `index.html` in a browser shows a canvas with a bird and a "ready" prompt
- [ ] Space / click / touch makes the bird flap; gravity pulls it down smoothly
- [ ] Pipes scroll right-to-left with randomized gaps at a fixed spacing
- [ ] Hitting a pipe, the ground, or the ceiling ends the game
- [ ] Score increases by 1 each time the bird clears a pipe; high score persists across reloads
- [ ] Game restarts cleanly from game-over without a page reload; motion is frame-rate independent

## Non-Goals (YAGNI)

- Sprite art / audio assets (use simple shapes + colors; a sound stretch-goal only if trivial)
- Mobile app packaging, multiplayer, leaderboards, backend
- Build tooling, bundlers, npm dependencies

<!-- slug: flappy-bird-game -->
