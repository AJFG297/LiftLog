# Reflect

Propose durable workflow improvements after a completed run. Do not edit skills
without the user's approval.

Use this after a hard task produced a reusable recipe, the user corrected the
approach, or tooling repeatedly failed. One unusual event is evidence to inspect,
not automatically a new rule.

1. Read the active task history through `history.read` and the decision trail.
2. Run three independent reviewers using
   `references/judgment-reviewer.md`, `references/tooling-reviewer.md`, and
   `references/divergent-reviewer.md`.
3. Give their full outputs under neutral labels to an independent synthesizer
   using `references/synthesizer.md`.
4. Sort proposals into Accepted, Rejected, and Backlog. A proposal earns Accepted
   only when it would change a future decision and has transcript evidence.
5. Prefer a check, script, type, lint rule, or routing change over more prose.
6. Present the proposed edits and wait for approval before changing any durable
   skill or project instruction.

**Reply:** evidence-backed proposals, rejected ideas and reasons, structural
enforcement options, and exact edits awaiting approval.
