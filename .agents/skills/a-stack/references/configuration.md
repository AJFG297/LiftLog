# A-stack configuration

A-stack works without configuration. A repository can add `.a-stack/config.md`
when it needs stable local mappings that do not belong in the provider adapter
or in general playbooks.

Keep the file declarative and short. Record only mappings that change how a
playbook runs:

```markdown
# A-stack configuration

- Provider adapter: codex
- Implementation role: default collaboration worker
- Judgment role: independent collaboration worker
- UI controller: browser-control
- CLI controller: terminal session
- Source control: git + GitHub
- Planning skills: grilling, prototype, to-spec, to-tickets
- Project adapters: dex-scm
```

## Resolution order

Resolve a capability in this order:

1. Host safety, permission, and sandbox rules.
2. Repository instructions such as `AGENTS.md`.
3. `.a-stack/config.md`.
4. The named provider adapter.
5. The generic adapter.

A lower layer cannot weaken a higher layer. A repository may select a different
installed skill, controller, model role, or source-control method. It may not
remove the intent gate, parent diff review, real-surface verification, or the
host's authorization checks.

## Provider portability

Do not store raw tool calls in configuration. Name the A-stack operation or
role, then the available capability that satisfies it. This keeps playbooks
portable when a provider renames tools or exposes the same capability through a
plugin.
