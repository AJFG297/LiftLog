### Orchestrate

**You own the program and its briefs, never the implementation.** Use this only
for multi-day work with many independently deliverable changes. One task driven
to one predicate belongs to Autonomous run.

## Durable state

Create `.a-stack/orchestrate/<project>/` with one writer per file:

- `preferences.md` holds numbered standing orders.
- `overview.md` records scope, tracks, and durable repository links.
- `units.tsv` records unit, track, state, owner, branch, PR, head, and brief.
- `ledger.tsv` records verification verdicts keyed by change and head.
- `frontier.json` records the ordered merge frontier and generation.
- `inbox/` receives completion pointers.
- `gates.md` collects human decisions.
- `decisions.tsv` is the Show me your work trail.
- `status.md` is derived from the tables rather than hand-maintained prose.

## Brief contract

Every worker brief contains GOAL, SCOPE, CONTEXT, ACCEPTANCE, VERIFY, TIMEBOX,
FORBIDDEN, REPORT, and STANDING orders. A field the coordinator cannot fill is a
unit that is not ready to spawn.

## Steps

1. Frame a countable done predicate, unit estimate, tracks, delivery authority,
   and wall-clock budget. Route back to Autonomous run if one agent can finish
   inside the budget.
2. Initialize durable state and open the decision trail.
3. Push one representative unit through brief, implementation, verification,
   integration, and delivery. Fix the contract from pilot evidence.
4. Scale with a rolling window of workers. Use sub-coordinators only when one
   coordinator cannot drain the results without becoming the bottleneck.
5. Treat completions as inbox events. Drain at safe points, classify every
   result, update tables, create verification or fix work, and refill the window.
6. Integrate verified work continuously. One topology owner controls each
   dependent chain. A new head invalidates its ledger verdict.
7. Close by reconciling every spawned worker, proving the whole predicate on the
   real artifact, auditing the trail, and leaving durable state for postmortem.

## Liveness and escalation

Probe status with provider read operations. Do not restart an idle agent merely
to ask whether it is alive. Retry a failed unit by evidence and cap repeated
failures. Escalate irreversible actions, product decisions, conflicting standing
orders, and program-level dead ends. Route reversible mechanics around collected
gates.

**Reply:** predicate counts from durable tables, tracks and landed changes,
frontier identifiers, verdict totals, abandoned work, human gates, and state
paths.
