# Interrogate

Give the same diff, intent, and rubric to independent adversarial reviewers, then
apply lead judgment. This capability advises. It never auto-applies changes.

1. Resolve the exact diff and write a one-paragraph statement of intended
   behavior and non-goals.
2. Read `references/rubric.md` and add task-specific risk lenses. Include
   `references/code-quality-review.md` for implementation work.
3. Select the reviewer roles in `.a-stack/config.md` when present. Otherwise ask
   the provider for up to four independent reviewers. Prefer model-family
   diversity and report when all reviewers inherit one model.
4. Launch reviewers together through `subagent.spawn`. They receive identical
   inputs and cannot see one another's findings.
5. Deduplicate by mechanism, not wording. Agreement from independent reviewers
   raises confidence but does not replace source verification.
6. Apply `references/lead-judgment.md`. Classify every finding as Act on,
   Consider, Noted, or Dismissed and give a reason for dismissals.
7. Verify high-impact findings directly before recommending code changes.

**Reply:** verdict, Act on, Consider, Noted, Dismissed, reviewer independence,
and evidence for the high-impact calls.
