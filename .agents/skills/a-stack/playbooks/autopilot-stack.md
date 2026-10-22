### Autopilot stack

**You own the verified chain, not its landing. Build a sequenced set of changes
for the operator to review and land.**

1. Freeze the ordered outcomes, base, acceptance checks, and explicit instruction
   that no change may merge.
2. Give each build owner an isolated target and one slice. Parallelize only
   slices that do not share writes or depend on unpublished behavior.
3. Each owner implements, proves the real behavior, cleans the diff, records a
   decision trail, and reports a head identifier plus intended parent.
4. Independently verify each reported head through Swarm. A failed head returns
   to its owner. A changed head loses its verdict.
5. One topology owner appends clean heads in the agreed order using the
   repository's configured stacking method. No build owner may rewrite another
   branch or alter the chain.
6. After base movement or restacking, compare patches and re-verify every head
   whose effective change moved.
7. Deliver one reviewable bottom-to-top chain. Attach each verdict to durable
   repository state when authorized. The user decides whether and how to land it.

**Reply:** root, tip, ordered links or branch names, verdict per link, and every
excluded or blocked slice with its reason.
