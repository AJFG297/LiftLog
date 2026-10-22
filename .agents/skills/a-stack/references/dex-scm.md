# DEX SCM adapter

Load this adapter only when repository instructions identify the project as DEX
SCM. The repository's current `AGENTS.md`, `CONTEXT.md`, ADRs, and linked domain
documents remain authoritative.

## Routing additions

- Read `CONTEXT.md` before changing domain language or lifecycle concepts.
- Read the pipeline handbook and relevant ADRs before matching, review, approval,
  order-extras, document-history, or export changes.
- Apply the customization decision ladder before adding company-specific logic.
- Plan multi-layer work as independently shippable vertical slices.
- Treat tenant isolation, immutable final state, audit integrity, forward-only
  lifecycle movement, approval rules, and export durability as human-gated
  contracts rather than reversible implementation details.
- Include structured operational evidence at workers and external-system seams.
- Run repository-required lint, anti-slop, tests, and real-flow checks for the
  touched area. A build alone does not complete a DEX change.

## Review additions

Interrogate every change to RLS, tenant-safe foreign keys, review RPCs, final
snapshots, profile selection, export adapters, and queue retry behavior. The
blast-radius proof must exercise the safety fact rather than restating policy.
