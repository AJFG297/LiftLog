# Show me your work

Keep an append-only decision trail for long-running or unattended work.

## Format

Use one TSV file with columns `ts`, `phase`, `decision`, `why`, `evidence`, and
`result`. Copy `references/decision-log-template.tsv` for the header or use
`scripts/log.sh` to append safe rows.

Log forks, accepted or reverted experiments, completed units, blockers, and
verification checkpoints. Skip routine commands. Evidence is a resolvable path,
commit, PR, screenshot, trace, or output artifact rather than a paragraph.

Keep the trail local at `decisions.tsv` or `.audit/<task>.tsv` by default. Commit
it only when a reviewer needs the trail to trust ambitious work.

Before hand-back:

1. Compare the trail with the active task history through `history.read`.
2. Remove invented or padded rows, add missing decisions, and confirm every
   evidence pointer resolves.
3. Give the trail and scoped history to an independent reviewer. Ask what the
   user should inspect, not for a redo of the work.

**Reply:** trail path, predicate state, and an Attention section naming the
independent reviewer and every weakly evidenced or risky decision.
