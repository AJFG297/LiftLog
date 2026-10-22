# Upstream relationship

A-stack is adapted from PSTACK by Lauren Tan in `cursor/plugins`.

- Upstream repository: https://github.com/cursor/plugins/tree/main/pstack
- Initial upstream commit: `60c641e4fad674784b30abcf9f8915dea39df38d`
- Upstream license: MIT

## Preserved contracts

A-stack retains PSTACK's task router, playbook selection, principle leaves,
delegated implementation, parent-owned review, real-artifact proof, adversarial
review, durable decision trail, pause and pickup, PR stages, and long-run
coordination.

## Deliberate changes

- Provider operations resolve through an adapter contract.
- Codex is the first concrete provider adapter.
- Commercial model slugs are replaced by roles.
- Aidan's intent gate runs before implementation routing.
- Compatible Pocock skills handle grilling, specs, tickets, TDD, review, and
  handoff where installed.
- DEX SCM adds a repository adapter without changing the generic core.
- Capabilities and principles are internal modules under one discoverable skill,
  reducing global skill-selection pressure and name collisions.

Future upstream updates should be compared by behavioral contract before being
ported. Preserve Lauren Tan's copyright notice in `LICENSE`.
