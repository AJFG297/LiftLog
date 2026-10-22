# Architect

Settle caller usage, types, seams, and module shape before implementing a change
that crosses a real seam.

1. Run How over the affected system. Run Why when ownership or layering carries
   historical constraints.
2. Write the caller's desired usage first. Name invariants, error modes, state,
   and performance facts the interface must carry.
3. Run Arena with at least two materially different design sketches. Each uses
   `references/runner-prompt.md` and produces the shape in
   `references/rationale-template.md`.
4. Compare depth, locality, seam placement, testability, migration cost, and the
   red flags in `references/design-red-flags.md`.
5. Synthesize one design. If the choice is contested or expensive to reverse,
   run Interrogate before implementation.
6. Continue into the matched implementation playbook unless the user requested a
   design checkpoint.

**Reply:** caller usage, alternatives, selected interface, module map, rationale,
migration effect, and open decisions.
