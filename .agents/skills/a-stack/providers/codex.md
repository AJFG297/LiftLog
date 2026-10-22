# Codex adapter

Use this adapter when A-stack runs in Codex. Discover tools by capability because
names can vary between Codex products and plugin versions.

| A-stack operation | Codex mapping |
|---|---|
| `task-list` | Use the task-plan operation when present. Keep at most one item in progress. |
| `subagent.spawn` | Use Codex collaboration subagents. Give each a concrete bounded task and an isolated write scope when it writes. |
| `subagent.wait` | Use the collaboration wait operation with a bounded wait. Avoid busy polling. |
| `subagent.message` | Use collaboration message or follow-up operations. |
| `subagent.interrupt` | Use collaboration interruption only when continuing would waste work or create risk. |
| `history.read` | Prefer Codex task and thread tools. Scope reads to the current workspace or explicitly named task. |
| `continuation` | Continue within the active task. Use goals, waits, monitors, or automations only when the user explicitly requests the corresponding persistent behavior. |
| `surface.ui` | Prefer an installed browser-control skill, then computer use when the browser skill cannot reach the target. |
| `surface.cli` | Use the terminal operation and keep long processes in a resumable session. |
| `scm.read` | Prefer the GitHub plugin for hosted state and local Git for the checkout. |
| `scm.write` | Follow Codex GitHub authorization rules. Treat commit, push, PR creation, review actions, and merge as separate permissions unless the user's request clearly includes them. |
| `user-input` | Ask in the final response unless an interactive user-input operation is available in the active mode. |
| `skill-authoring` | Use Codex skill-creator, writing-for-agents, and plugin-creator guidance when available. |

Use provider commentary for short progress updates during tool work. Put the
complete, self-contained result in the final response.

When diverse model families are available, use them for Arena candidates,
Interrogate reviewers, and independent verification. When they are unavailable,
use independent subagents with separated briefs and report that the review was
independent but not cross-family.

At compaction or a requested pause, use the Pause safely playbook. Write durable
state outside the conversation, then resume through Session pickup instead of
reconstructing completed work.
