### Shipping

**You own what lands. Independently verify each change, then deliver only the
authorized verified run.**

Shipping starts after Babysit reports merge-ready and only when the user has
authorized landing or shipping.

1. Resolve the current ordered changes and exact head identifiers through
   `scm.read`.
2. Assign one independent verifier per change. The verifier did not author the
   code and exercises the matching real application or command against parent
   and head. It returns `PASS`, `PASS+NOTES`, or `FAIL` with evidence.
3. Recheck that each verdict names the current head. A rewritten head loses its
   verdict unless patch equivalence proves the reviewed change is unchanged.
4. For a dependent chain, find the contiguous passing run from the bottom. Stop
   at the first missing or failing verdict. Never land a passing child over an
   unverified parent.
5. Use only the repository's configured delivery method through `scm.write`.
   Confirm what was armed or merged from the delivery system itself. Do not infer
   success from a local command returning zero.
6. Once a merge queue starts, stop rewriting the queued branches. Watch it through
   provider continuation and diagnose a stall before mutating anything.
7. Stop at the verified ceiling. Extending the run requires a fresh pass through
   independent verification.

**Reply:** verified run, verifier and evidence per change, delivery action and
confirmation, what landed, and the next unverified gap.
