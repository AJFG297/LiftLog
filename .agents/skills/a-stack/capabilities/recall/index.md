# Recall

Rebuild current working context on a topic from the user's scoped task history
and live repository state.

1. Classify the request. One named task to resume routes to Session pickup.
   Durable preference mining routes to Automate me.
2. Set the workspace, topic, and time range. Default to the active workspace and
   recent history. Never broaden into unrelated projects silently.
3. Use `history.read` through the provider adapter. Delegate long-history
   reduction and keep only a compact timeline in the parent.
4. Reconcile conversation claims with the current branch, commits, PRs, issues,
   and checks through `scm.read`.
5. Separate landed, open, reverted, planned, and blocked work. Name contradictions
   and prefer live repository state for operational facts.
6. Return the smallest state capsule that lets work continue without rereading
   the history.

**Reply:** current state, recent decisions, durable links, unresolved questions,
and the recommended resume point.
