### Worktree cleanup

**You own the evidence, not permission to discard unknown work.**

1. Record disk usage and enumerate worktrees from `git worktree list`.
2. For each worktree, record branch, size, merge state, uncommitted tracked and
   untracked files, open PR state, and any task history that still references it.
3. Classify candidates as clean-and-merged, clean-and-abandoned, active,
   uncommitted, or unknown. The classification is advice rather than deletion
   permission.
4. Clean merged worktrees with no active task can use the repository's normal
   recoverable cleanup path when the user requested cleanup. Uncommitted, active,
   and unknown work requires an explicit decision with the exact paths shown.
5. Remove only the confirmed set, prune Git metadata, relist worktrees, and
   measure disk usage again.
6. Treat simulators, IDE state, and package caches as separate targets. Inventory
   each exact path and request authorization before irreversible deletion.

**Reply:** before and after usage, removed targets, recoverability, and every held
target with its reason.
