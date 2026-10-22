# Swarm

Fan workers across independent slices, coverage lanes, or declared race arms and
aggregate one result.

1. State the matrix or race arms and the selection rule before spawning.
2. Give every worker a standalone brief with scope, evidence requirement, output
   location, and `PASS`, `ISSUES`, or `BLOCKED` return status.
3. Isolate every writer. Readers may share source state.
4. Select provider roles from `.a-stack/config.md` when present, otherwise let the
   adapter choose. Use remote environments only when available and helpful.
5. Launch the workers together, continue useful parent work, then drain results
   through `subagent.wait`.
6. Verify receipts, report dropouts, and aggregate without hiding uncovered
   slices. For a race, apply the declared rule rather than post-hoc taste.

Use Arena when every worker attempts the same artifact and the result requires
base selection plus grafting.

**Reply:** coverage matrix, status per worker, consolidated findings, gaps, and
the selected arm when this was a race.
