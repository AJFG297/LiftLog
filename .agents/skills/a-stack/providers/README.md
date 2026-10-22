# Provider adapters

An adapter maps every operation in
[`provider-contract.md`](../references/provider-contract.md) to capabilities the
host actually exposes. It does not rewrite playbooks or weaken host safety
rules.

To add a provider:

1. Copy `generic.md` to `<provider>.md`.
2. Map every required operation explicitly, including unavailable operations.
3. Keep model choices role-based. Never move commercial model slugs into the
   portable core.
4. State the host's write-authorization and sandbox behavior.
5. Add the adapter to the selection rule in `../SKILL.md`.
6. Extend `scripts/validate.py` to require the new mapping.

An adapter may narrow what a playbook can automate. It may not infer permission
for publishing, merging, deployment, deletion, or external communication.
