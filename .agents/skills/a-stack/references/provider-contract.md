# Provider contract

A-stack playbooks describe operations, not product-specific tool calls. Resolve
each operation through the active provider adapter.

## Required operations

| Operation | Contract |
|---|---|
| `task-list` | Create and update ordered work with one active item. Preserve skipped required steps with a reason. |
| `subagent.spawn` | Start an independent worker with a bounded brief, role, write scope, and completion contract. |
| `subagent.wait` | Wait efficiently and return only new status or the final result. |
| `subagent.message` | Send new evidence or scope without restarting completed work. |
| `subagent.interrupt` | Stop work that is unsafe, obsolete, or writing the wrong target. |
| `history.read` | Read only task history in the active workspace or an explicitly named task. |
| `continuation` | Keep authorized work progressing toward a checkable predicate without inventing broader permissions. |
| `surface.ui` | Drive and inspect the running graphical application. |
| `surface.cli` | Drive and inspect the real command-line application in a persistent terminal when needed. |
| `scm.read` | Inspect branches, diffs, commits, issues, PRs, reviews, and checks. |
| `scm.write` | Perform only the exact authorized commit, push, PR, review, or merge action. |
| `user-input` | Ask only for product intent, preference, missing authority, or ambiguity no observation can settle. |
| `skill-authoring` | Create or update agent instructions using the provider's supported skill format and validation. |

## Capability discovery

Read the active adapter before assuming an operation exists. When a preferred
operation is unavailable, use the closest safe equivalent and report the lost
guarantee. Do not fabricate tool names or claim model diversity when the
provider cannot supply it.

## Roles, not model slugs

Playbooks request roles such as explorer, implementation worker, adversarial
reviewer, judge, and verifier. The adapter selects an available model or inherits
the parent. A-stack core never hardcodes a commercial model name.

## Authorization

Provider adapters may narrow autonomy but may not broaden it. Read-only
inspection and reversible workspace work can proceed when the user requested
the task. External publication, merges, deployments, deletion, messages, and
other consequential writes require the authorization rules of the host.
