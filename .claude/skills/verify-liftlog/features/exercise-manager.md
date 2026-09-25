# Exercise manager

The exercise library lists every exercise a user can pick in plans and workouts. From it a user adds a custom
exercise, edits its name and instructions inline, filters the list by name, and deletes an exercise by swiping, with
an `Undo` snackbar that restores it.

## Sub-features

- `exercises-add` adds a `New exercise` entry.
- `exercises-edit` renames it and edits its instructions inline.
- `exercises-filter` narrows the list by name from the search box.
- `exercises-delete-undo` swipes to delete and restores with `Undo`.

## How to get to it (user POV)

- Settings → `Manage exercises`.
- While editing a plan's exercise, the exercise-name search (`exercise-search` route) picks from the same library.

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md). Note `verify.sh db "select count(*) from exercise;"`.

- **Whole path in one go.** Run `verify.sh flow app/.maestro/exercise-manager.yaml exercise-manager`. Exit 0; the
  flow deletes its exercise at the end.
- **Add.** `tapOn: 'Settings'`, `tapOn: 'Manage exercises'`, `tapOn: 'Add exercise'` → `assertVisible: 'New exercise'`.
- **Delete and undo.** `swipe: {from: {id: 'exercise-accordion'}, direction: LEFT}`, `tapOn: {id: 'exercise-delete-btn'}`
  → `assertVisible: 'New exercise deleted'` → `tapOn: 'Undo'` → `assertVisible: 'New exercise'`.
- **Edit.** `tapOn: {id: 'exercise-name-input'}`, `eraseText`, `inputText: 'E2E Bench Press'`; same for
  `exercise-instructions-input`; `hideKeyboard` → both values visible.
- **Filter.** `tapOn: {id: 'exercise-search-input'}`, `inputText: 'E2E'` → only `E2E Bench Press` remains.
- **Proof.** Before the final delete, `verify.sh db "select json_extract(payload,'$.name') n, json_extract(payload,'$.instructions') i from exercise where json_extract(payload,'$.name') like 'E2E%';"`
  returns the edited row; after the delete it returns nothing.

## Gotchas

- `exercise-accordion` is the first matching row; with the filter empty, that is whichever exercise sorts first, so
  add/filter before swiping when the library has custom entries.
- The snackbar auto-dismisses; tap `Undo` in the step right after the delete.
- The keyboard can cover the list; `hideKeyboard` before asserting.
- The `exercise` table was empty on a fresh install (built-in exercises are not rows there), so a custom exercise
  is the only row a run will see unless earlier runs left some behind.
