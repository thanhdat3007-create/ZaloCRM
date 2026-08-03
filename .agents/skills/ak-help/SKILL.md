---
name: ak:help
description: Open the AgentKit help index. Use when users ask how to use ak, what skills are available, or which workflow to run.
---

# Help

Open the AgentKit help index when users ask how to use `ak`, what skills are available, or which workflow fits their task.

Use `scripts/skills_data.yaml` as the local catalog source. Summarize the relevant skills by category, then route to the most specific installed skill when the user's task is clear.

When the user needs a command, prefer concrete `ak` commands and keep examples scoped to the installed AgentKit kit.
