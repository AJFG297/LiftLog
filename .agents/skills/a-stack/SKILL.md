---
name: a-stack
description: Route non-trivial engineering work through intent discovery, planning, implementation, verification, review, continuation, and shipping. Use when the user invokes A-stack or wants a rigorous task-specific workflow without assuming the intent is already settled.
metadata:
  short-description: Aidan's provider-agnostic engineering mode
---

# A-stack

A-stack is a provider-agnostic adaptation of Lauren Tan's PSTACK. It keeps the
router, playbooks, principles, delegated implementation, adversarial review,
runtime proof, and durable continuation. It adds an intent gate informed by
Matt Pocock's skills and a DEX SCM project adapter.

## Start

For every multi-step task:

1. Read [the provider contract](references/provider-contract.md), then read the
   adapter for the active provider. Use [Codex](providers/codex.md) in Codex and
   [generic](providers/generic.md) elsewhere.
   Apply repository-local overrides from
   [A-stack configuration](references/configuration.md) when present.
2. Read [Aidan's working preferences](references/aidan.md), then
   [the intent gate](references/intent-gate.md). Resolve uncertainty before
   choosing an implementation playbook.
3. Read this file's principle index. Open every leaf principle that changes a
   decision in the current task.
4. Choose direct delivery or planned delivery. Read
   [the Pocock adapter](references/pocock.md) for the planning path.
5. Match exactly one primary playbook. Copy its steps into the provider's task
   list before adding task-specific work. A skipped step stays visible as
   `skip: <reason>`.
6. Load each internal capability in full when the playbook calls it. Resolve an
   installed equivalent through [the capability map](references/capabilities.md)
   only when it satisfies the same contract.
7. Read repository instructions before acting. When the repository identifies
   itself as DEX SCM, also read [the DEX adapter](references/dex-scm.md).

Stay in A-stack for follow-up turns on the same task. A request containing
`new task` starts routing again from the intent gate.

## Intent before autonomy

Classify every material unknown:

- A fact about the current system goes to Investigation, `how`, `why`, or a
  direct observation.
- A question that a small experiment can answer goes to Prototype.
- A product choice, policy, preference, or definition of success goes to
  grilling. Do not let an autonomy rule decide it for the user.
- Settled intent proceeds to delivery selection.

The intent gate passes when the task has an actor, an observable outcome,
acceptance evidence, material constraints, non-goals, and explicit human-only
decisions in proportion to the work's risk. Small work can carry this in the
task list. Large work records it in a spec.

## Delivery selection

Recommend direct delivery when one session can implement and verify one
coherent change. Recommend planned delivery when the work spans sessions,
contains several user-visible slices, changes a high-risk contract, or needs
parallel ownership.

When either path is reasonable and the choice changes review cost materially,
ask the user. Otherwise state the chosen path and proceed.

- Direct delivery routes into the matched A-stack playbook.
- Planned delivery uses the installed spec and ticket skills when compatible
  Pocock skills exist. Otherwise follow
  [the multi-phase plan](references/plan.md). Every
  resulting vertical slice re-enters A-stack as its own implementation task.

## Non-negotiables

- A non-trivial change or an "are we sure?" question loads `how`.
- Code names its data shape and organizing structure before implementation.
- A change that creates or moves a real seam loads `architect` and explores at
  least two materially different interfaces. Mechanical work records why this
  does not apply.
- Parallel work gives each writer an isolated target. Use `swarm` for partitioned
  coverage and `arena` for competing attempts with base selection.
- The parent owns intent, design, diff review, and final verification. A delegate
  may implement, but its report is evidence to inspect rather than proof.
- Completion requires proof against the real artifact. A build or self-report is
  supporting evidence only.
- Work the user will review after stepping away keeps a decision trail through
  `show-me-your-work`.
- External writes retain the active provider's authorization rules. Autonomy
  never authorizes publishing, merging, deployment, deletion, customer contact,
  or other consequential external action.

## Capability calls

Capabilities live under `capabilities/<name>/index.md`. Loading a capability is
an internal call. Read its index and every reference it marks as required.
Provider operations inside a capability resolve through the active adapter.

The common calls are `how`, `why`, `recall`, `blast-radius`, `architect`,
`arena`, `swarm`, `interrogate`, `tdd`, `show-me-your-work`, `figure-it-out`,
`create-verification-skill`, `maintain-verification-skill`, `no-comments`,
`technical-writing`, `unslop`, and `reflect`.

## Principle index

Leaf files live under `principles/`. Load a leaf only when its trigger applies.

### Core

- `laziness-protocol` for diff size, refactors, and new abstraction pressure.
- `foundational-thinking` before choosing core types, data structures, or work
  sequence.
- `redesign-from-first-principles` when a new requirement changes an existing
  design assumption.
- `subtract-before-you-add` before additions, rewrites, and migrations.
- `minimize-reader-load` when code requires hidden state or many layers to trace.
- `outcome-oriented-execution` for explicit rewrites and migrations.
- `experience-first` for product and interaction tradeoffs.
- `exhaust-the-design-space` for novel, expensive-to-reverse decisions.
- `build-the-lever` when a repeatable tool can perform or prove non-trivial work.

### Architecture

- `model-the-domain` for stateful logic, branching, and repeated shape rules.
- `boundary-discipline` for validation, transport adapters, and external inputs.
- `type-system-discipline` for typed interfaces and external parsing.
- `make-operations-idempotent` for retries, crashes, queues, and repeated runs.
- `migrate-callers-then-delete-legacy-apis` for internal contract replacement.
- `separate-before-serializing-shared-state` for concurrent writers.

### Verification and delegation

- `prove-it-works` before declaring completion.
- `fix-root-causes` for defects and regressions.
- `sequence-verifiable-units` for multi-step work, commits, and PR stacks.
- `guard-the-context-window` for bulk reads, long transcripts, and fan-out.
- `never-block-on-the-human` for reversible execution choices after intent passes.
- `encode-lessons-in-structure` when guidance repeats.

## Playbook routing

Playbooks live under `playbooks/`.

- `investigation` for read-only questions.
- `bug-fix` for a reproducible defect.
- `perf-issue`, `hillclimb`, `runtime-forensics`, or `trace-forensics` for measured
  runtime work.
- `feature` for new or changed behavior.
- `refactoring` for behavior-preserving structural work.
- `prototype` for an empirical or design fork.
- `visual-parity` for visual equivalence.
- `authoring-a-skill` and `eval` for agent instruction work.
- `multi-phase-plan` for a plan whose output precedes implementation.
- `figure-it-out` when no standard playbook fits a large one-off run.
- `autonomous-run` for one task driven to a checkable predicate.
- `orchestrate` for a program that outlives one agent session.
- `autopilot-full` for independent authorized changes carried through delivery.
- `autopilot-stack` for a verified stack the user will land.
- `session-pickup` and `pause-safely` for continuation.
- `opening-a-pr`, `babysit`, and `shipping` for delivery stages.
- `worktree-cleanup` for evidence-gated cleanup.

## Reply

Lead with the user-visible outcome, then the maintainer-visible change. Name the
playbook, delivery path, proof, open decisions, and any applied principle with
the decision it changed. Never cite a principle without naming its effect.
