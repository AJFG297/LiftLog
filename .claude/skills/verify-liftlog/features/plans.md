# Plans and workout editor

A user builds a training plan: create a plan, add workouts to it, add exercises to each workout, and set each
exercise's sets, reps, superset link and progressive-overload rules. Edits save as they are made and survive leaving
and reopening the editor; the active plan's next workout appears on Home's Up next card.

## Sub-features

- `plan-create` adds a new plan from the Routines tab and opens it.
- `plan-workout-add` adds a workout to a plan (opens the workout editor).
- `plan-exercise-edit` adds an exercise and edits sets/reps (`fixed-increment` / `fixed-decrement`), superset.
- `plan-progression` adds and orders progression rules and narrows their scope (see `docs/Progression.md`).
- `plan-remove` removes a plan from the plan list's more-menu.
- `plan-import` imports a `.liftlogplan` file (Routines tab's import action; see `docs/PlanFileFormat.md`).

## How to get to it (user POV)

- Routines tab → `Add plan`.
- Home (no plan workouts) → `Choose a routine`, or Home → Up next card → `Other`; both go to Routines.
- Opening a `.liftlogplan` file or `liftlog://` link → import screen.

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md). Note `verify.sh db "select count(*) from program;"`.

- **Whole path in one go.** Run `verify.sh flow app/.maestro/creating-a-plan.yaml plans`. Exit 0; the flow removes
  its own plan at the end, so the `program` count returns to where it started.
- **Create.** `tapOn: 'Routines'`, `tapOn: 'Add plan'` → `assertVisible: 'Add workout'`.
- **Add workout and exercise.** `tapOn: 'Add workout'` → `tapOn: 'Add exercise'` → `assertVisible: 'Weighted'`.
- **Sets/reps.** Sets and reps share IDs; sets is `index: 0`, reps `index: 1`:
  `tapOn: {id: 'fixed-decrement', index: 1}` (reps 10→9), `tapOn: {id: 'fixed-increment', index: 0}` (sets 3→4).
- **Superset.** `scrollUntilVisible` to `Superset next exercise`, then `tapOn: 'Superset next exercise'` (tap the row
  label; the Compose switch has no testID).
- **Progression.** `scrollUntilVisible: {element: {id: 'progression-add-rule'}}`, `tapOn: {id: 'progression-add-rule'}`;
  scope dropdown `Every set` → `Every lowest`; a second add inserts a rule in front (`Rule 2`, `Stop at a limit`).
- **Persistence.** `back` → `assertVisible: 'Exercise 1'` → reopen it → `assertVisible: {id: 'fixed-value-input', text: '9'}`
  and `{id: 'fixed-value-input', text: '4'}`, superset switch `checked: true`, `Rule 2` present.
- **Remove.** `back` ×3 lands on You (the plan editor is on the You tab's settings stack), so `tapOn: 'Routines'`,
  then `tapOn: 'More for New plan'` (each plan's more button is named for its plan), `tapOn: 'Remove'` →
  `assertVisible: 'Plan deleted'`.
- **Proof.** Before removing, `verify.sh db "select json_extract(payload,'$.name') name, json_extract(payload,'$.sessions[0].exercises[0]') ex from program;"`
  shows the new plan with the 4×9 exercise and `supersetWithNext: true`.

## Gotchas

- New plans are named `New plan`; a leftover one from a failed run makes `More for New plan` ambiguous. Remove
  leftovers before re-running.
- Don't pick a plan's more button by position (`id: 'more-program-btn'` with `rightOf:`/`below:`): the match isn't
  kept to the row, so it can open the active plan's menu (where Remove is disabled) or another plan's and remove it.
- A plan row can sit under the Add plan / Import toolbar. Taps on the toolbar used to fall through to that row; if
  `Add plan` opens a plan's menu or `Import` switches the active plan, that bug is back.
- Fields below the fold need `scrollUntilVisible` first; `tapOn` does not scroll.
- A fresh install's `program` table already holds an empty `My Plan` plus the presets (Starting Strength,
  Stronglifts 5x5, PPL, PHUL, calisthenics, Cardio), so count rows before/after instead of expecting one. Creating a
  plan does not by itself change Home's Up next card; that follows the chosen plan.
