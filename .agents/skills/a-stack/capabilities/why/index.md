# Why

Reconstruct why a decision, behavior, or constraint exists. Use primary evidence
and keep direct evidence separate from inference.

1. Resolve the exact question and time range. If the referent is ambiguous, state
   the interpretation and allow correction.
2. Discover available evidence through provider operations. Search relevant
   categories in parallel when available: source control, issues, long-form docs,
   team discussion, incidents, observability, error tracking, and analytics.
3. Give each investigator one category, the question, and
   `references/investigator-prompt.md`. Investigators remain read-only even when
   the provider requires a separate connected-data operation.
4. Record null results. Absence of a documented reason is evidence about the
   record, not permission to invent one.
5. Synthesize a dated evidence chain. Label statements as direct evidence,
   supported inference, or unresolved.
6. If a code change follows, convert findings into Preserve, Change, Avoid, and
   Risk constraints.

Resolve investigator and judgment roles through the active adapter. Read
`references/epistemics.md` and `references/source-playbook.md` when the evidence
is contested or spans several systems.

**Reply:** answer, evidence chain with links, inference labels, sources consulted,
null results, and change constraints when relevant.
