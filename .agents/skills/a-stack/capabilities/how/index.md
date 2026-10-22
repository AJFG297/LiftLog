# How

Explain how a subsystem works now. Trace runtime flow, ownership, key data
shapes, seams, and placement before judging the design.

## Route

- A narrow question gets one read-only explorer.
- A subsystem-sized question gets two to four explorers with disjoint scopes.
- Critique mode explains first, then gives the explanation and source pointers to
  independent critics.

## Steps

1. State the question and affected area. Read repository vocabulary and relevant
   architecture records.
2. Assign explorers through `subagent.spawn` when fan-out would reduce context
   load. Each returns file pointers and a reduced flow, never raw dumps.
3. Trace one concrete execution path from entry to outcome. Name key types and
   where decisions are owned.
4. Synthesize one explanation. Resolve conflicting explorer claims against
   source rather than averaging them.
5. In Critique mode, run independent reviewers against the grounded explanation
   using `references/critique-rubric.md`, then apply lead judgment.

Resolve explorer, explainer, and critic roles through the active adapter. Prefer
model-family diversity when available and report when it is not.

**Reply:** concise mental model, runtime path, ownership, key types, source
pointers, and critique only when requested or routed.
