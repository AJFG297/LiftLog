# Generic provider adapter

Use this adapter when A-stack has no named host adapter.

Resolve every contract operation before starting material work:

| A-stack operation | Generic resolution |
|---|---|
| `task-list` | Use the host's ordered task or plan mechanism. If none exists, keep a visible checklist in the task. |
| `subagent.spawn` | Use the host's independent-worker mechanism with a bounded brief and isolated write scope. If none exists, execute serially and preserve review separation with a fresh review pass. |
| `subagent.wait` | Use event-based or bounded waiting. Do not busy-poll. |
| `subagent.message` | Send new evidence to the existing worker when supported; otherwise incorporate it in the parent review. |
| `subagent.interrupt` | Stop obsolete or unsafe work when supported. Otherwise discard its result. |
| `history.read` | Read only host-exposed history for the active workspace or an explicitly named task. |
| `continuation` | Use the host's continuation, monitor, or scheduled wake mechanism only when authorized. Otherwise persist a handoff for the next session. |
| `surface.ui` | Use the installed graphical controller. Report when no real UI controller exists. |
| `surface.cli` | Use the host terminal, preserving a resumable session for long-lived processes. |
| `scm.read` | Use local source control and an installed forge integration for hosted state. |
| `scm.write` | Apply the host's authorization rules separately to commit, push, PR, review, merge, and release actions. |
| `user-input` | Use the host's interactive question mechanism or ask in the response. |
| `skill-authoring` | Use the host's native instruction format, creator guidance, and validator. |

Keep unavailable operations explicit. Replace them with a safe local method when
possible and report the weaker guarantee. Keep model selection role-based and
inherit the parent when the provider exposes no model choice. Follow the host's
authorization and sandbox rules for every write.

Provider absence can reduce parallelism or automation. It never lowers the
intent, evidence, or verification bar.
