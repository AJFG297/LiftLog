### Opening a PR

This playbook runs at the end of code-changing playbooks only when PR creation is
within the user's requested scope.

1. Work from a clean isolated branch or worktree based on the intended base.
   Preserve unrelated user changes.
2. Inspect staged and unstaged diffs. Stage only files belonging to the task.
3. Rework commits into small ordered states that remain buildable and reviewable.
   Stack follow-ups only when they genuinely depend on the earlier change.
4. Load `no-comments`, `unslop`, and any available provider code-cleanup
   capability. Review the resulting diff yourself.
5. Run Interrogate when the change is high-risk, contested, or explicitly asks
   for adversarial review.
6. Re-run the declared static and real-behavior checks against the exact head.
7. Use `scm.write` for the authorized commit, push, and PR actions. Treat those
   as separate permissions when the provider requires it. Reuse a matching open
   PR rather than opening a duplicate.
8. Return the durable PR link or identifier. Babysit starts only when requested
   or when the original request clearly included driving it to merge-ready.

**Reply:** ordered commits, proof, PR link, and any delivery action still awaiting
authorization.
