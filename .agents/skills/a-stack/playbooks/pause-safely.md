### Pause safely

**Leave a checkpoint a cold-start agent can resume.** Use on an explicit pause,
provider restart, or imminent context compaction. A request to continue or run
autonomously does not trigger this playbook.

1. Finish the current atomic step or back it out. Start nothing new and stop
   nested writers.
2. Keep the current authorization line. Do not publish, push, or open a PR merely
   to make a pause convenient.
3. Make authorized workspace changes durable. Prefer a clear WIP commit when
   committing is within scope; otherwise preserve an exact patch and path.
4. Write an off-context resume note containing intent, definition of done,
   verified progress, current branch and worktree, open tasks, decisions, key
   files, blockers, and the first next action. Point to an existing decision
   trail rather than copying it.
5. Confirm the note and durable artifacts exist before ending the turn.

**Reply:** loop position, durable paths and commits, tree state, unverified work,
and the first action on resume.
