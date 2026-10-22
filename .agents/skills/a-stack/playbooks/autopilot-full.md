### Autopilot full

**You own the verdicts. One owner carries each independent change through its
authorized delivery lifecycle. Nothing lands on its author's verdict alone.**

Use this playbook only when the user explicitly authorizes autonomous delivery
for a queue of independent changes. Operator-owned items remain operator-owned.

1. Freeze the queue, delivery permissions, acceptance checks, and stop command.
   A request to describe the protocol is not permission to start it.
2. Spawn one owner per independent change. Give each an isolated branch or
   worktree, exact scope, acceptance checks, forbidden actions, and report
   contract. Each owner keeps an uncommitted decision trail.
3. Owners implement, prove the real behavior, clean the diff, open or update the
   change through `scm.write`, and run Babysit to merge-ready. Overlapping changes
   serialize or become a planned stack.
4. At each merge-ready head, run Swarm with independent verification lanes. At
   minimum, rerun the declared checks, exercise the load-bearing behavior, and
   audit the diff and receipts without trusting the PR description.
5. A clean root verdict authorizes only the delivery actions granted in step 1.
   A new head invalidates the verdict unless a patch-equivalence check proves the
   reviewed change is identical.
6. Audit owner liveness and protocol adherence through provider read operations.
   Fix reversible drift, stop garbage-producing work, and keep human gates
   collected rather than interrupting per item.
7. On the user's stop, interrupt every writer before doing more review or
   bookkeeping.

**Reply:** queue item, owner, head identifier, proof, independent verdict,
delivery state, and every gate still reserved for the user.
