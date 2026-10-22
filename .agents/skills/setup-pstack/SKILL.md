---
name: setup-pstack
description: Configure which providers and models pstack uses per role and at what reasoning budget. Detects available combinations and writes a shared user-level configuration that overrides skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.agents/pstack-models.md`, the user-level provider and model configuration shared by every pstack host. Pstack skills read it when choosing subagents and fall back to inline defaults.

## Steps

### 1. Detect available providers and models

Enumerate the exact provider, model, and effort combinations available to subagents in this session. When Flowie exposes a delegated-model catalog, query it first because it covers cross-provider routing. Then inspect the current host's model APIs or CLI for combinations the catalog does not cover. Accept an exact combination supplied by the user when they have independently confirmed it.

Route model families through their native providers unless the user explicitly chooses otherwise: GPT through Codex/OpenAI, Claude and Fable through Claude Code, Gemini through its available Google host, and Grok through Cursor when Cursor is the confirmed provider. Never silently substitute a provider, model, or effort.

The aliases `inherit-parent` and `auto` are always valid even when no catalog lists them.

### 2. Load current state

If `~/.agents/pstack-models.md` exists, read its budget, role values, and explicit fallback comments as the current choices. Otherwise start from the upstream role defaults. Preserve customized providers, models, lists, aliases, and fallback comments. Identify retired role lines, such as `how critics`, and list them for confirmation before removing them.

### 3. Budget, map, and confirm

Ask for a reasoning budget, showing the current budget when recorded. Offer `unlimited` for max, `large` for xhigh, `medium` for high, and `small` for medium.

Keep customized providers, model identities, panel lists, aliases, and fallbacks. Apply a budget by changing only the `@effort` component of real entries, panel entries included. For the same provider and model, choose a confirmed effort at or below the target on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If none is available, mark the role as needing a choice. `inherit-parent` and `auto` remain unchanged. Never translate a provider or model to meet a budget.

Show every role with its current `provider/model@effort` value, marking any unavailable combination as needing a choice. Ask whether to accept the mapping or change specific roles. Also show retired role lines proposed for removal. Offer confirmed combinations plus `inherit-parent` and `auto`; both aliases run the role on the parent chat model.

For panel roles, the value is a comma-separated list and one subagent runs per entry, so the list length sets the count. Panel roles are `arena runners`, `architect runners`, and `interrogate reviewers`. `arena cross-judge pool` is also a list, but Arena selects one entry whose model family differs from the parent's when possible. `swarm workers` is the default for every worker unless a race or comparison names a different model per arm.

### 4. Validate

Every non-alias entry must match a confirmed provider, model, and effort combination. Stop and ask again when one is unavailable. Do not translate a display name into an unconfirmed slug.

### 5. Write the configuration

Overwrite `~/.agents/pstack-models.md` so reruns stay idempotent. Keep the file host-neutral and use `provider/model@effort`. Preserve fallback comments and record the chosen budget. The role defaults now use Grok 4.7 for code and exploration, Opus 5.5 (`claude-opus-5-5-xhigh` in Cursor) for judgment and prose, and Grok for reflect tooling. Default panels contain Opus 5.5 and Grok 4.7. Resolve these families to confirmed native provider/model/effort combinations before writing them. Use `inherit-parent` when no matching default combination is available, unless the user chooses another confirmed combination. Existing choices always take precedence.

The shape below lists every supported role. Replace aliases only with confirmed combinations chosen in step 3:

```text
# pstack model configuration
# Delete a role line to fall back to that skill's default.
# budget: large
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent, inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
```

### 6. Confirm

Tell the user the shared configuration was written and that pstack hosts will use it in new sessions. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` wherever pstack is installed. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke `/create-formal-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
