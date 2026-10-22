# Pocock adapter

Use compatible Matt Pocock skills for intent discovery and durable planning when
they are installed. A-stack remains usable without them.

| Need | Preferred installed skill | A-stack fallback |
|---|---|---|
| Resolve human intent | `grilling` | Intent gate interview |
| Test a design or empirical fork | `prototype` | Prototype playbook |
| Record settled intent | `to-spec` | Multi-phase plan overview |
| Create vertical slices | `to-tickets` | Phase files with blocking edges |
| Test first | `tdd` | Internal TDD capability |
| Review standards and intent | `code-review` | Parent diff review plus Interrogate |
| Continue in a new context | `handoff` | Pause safely and Session pickup |
| Design a deep module | `codebase-design` | Architect capability |
| Sharpen domain language | `domain-modeling` | Model-the-domain principle |

An installed skill replaces an internal capability only when its observable
contract is compatible. Keep A-stack's proof, authorization, and hand-back steps
even when the implementation is delegated to an external skill.
