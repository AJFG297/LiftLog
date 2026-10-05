# Exercise picker

The screen for choosing exercises (PM-32, step 13 of the [redesign plan](./plans/redesign.md)). It is one
route, `app/exercise-search.tsx`, drawn by `components/smart/exercise-search.tsx` (`ExerciseSearch`), with
its pure logic in `components/presentation/workout-editor/exercise-picker.ts`. The parts All exercises
shares live outside the picker: the fuzzy match (`models/exercise-fuzzy-match.ts`), the muscle groups
(`models/muscle-groups.ts`: `MUSCLE_GROUPS`, `muscleGroupOf`, `musclesForGroup`), and the search field and
chip row (`foundation/search-field.tsx`, `foundation/chip-row.tsx`).

It is a `presentation: 'modal'` route rather than a form sheet (the one exception to D7): a page sheet on
iOS and a full-screen page on Android. It hides the native header and draws Cancel / title / New itself.
On iOS the page sheet already starts below the status bar, so the header adds no top inset there.

## Where it opens

| From | Mode | Hook |
| --- | --- | --- |
| Routine editor: Pick exercises, Add exercise | add | `useExercisePicker` |
| Live workout: the strip's last tile, the empty page, the All exercises sheet | add | `useAddExercise` |
| Editing a past workout: Add exercise | add | `useAddExercise` |
| Live workout: Swap; the exercise editor's name button | swap | `useExerciseSearch` |

- **Add** picks any number. Each tap adds the row to the end of the selection and shows its number, and
  tapping it again takes it out and closes the gap. **Add N exercises** hands them back in that order.
  With two or more, **As superset** hands them back linked, the last one closing the chain.
- **Swap** picks one: the tap closes the picker. It opens on the exercise's own name when that names one.

What was picked lands at the end of the routine or the workout as 3 × 10 with 1:30 rest and no progression
rules (`blueprintsForPick`). A superset flag left on the old last exercise linked nothing, and would join
the new ones, so it's cleared (`withPickAppended`, `sessionWithPickAdded`). In the routine editor the first
exercise added opens expanded; in the live workout the screen moves to it.

In a workout, each exercise added opens on the numbers a routine would give it at that place: last time's
weight carried over, and the second of an exercise already in the workout on that exercise's second place
last time (see [Progression.md](./Progression.md)). A swap keeps the plan (sets, reps, rest) under the picked
exercise and opens it the same way, keeping any set already logged (`sessionWithExerciseSwapped`). Both carry
from the carry-over cache without the workout's own entries (`withCarryOver`). When the cache's entry for an
exercise is the workout's own (a set of it logged today), it holds nothing from before, so just those exercises
are read from the tables without this workout (`latestPerLineage` with `excludeWorkoutId`) before the pick
lands. If that read fails, they open on the cache as it is, today's numbers included, and the failure is
logged. Picks for one workout land in the order they were made, so a pick made during a read waits behind it.
A pick lands in the workout it was picked for, and a swap only if that place still holds the exercise swapped
out. An edit of its plan meanwhile, such as Add set, is kept. The screens get this through `useCarryOver`.

## How the result comes back

The picker is its own route, so it can't call back. It puts `{ requestId, exercises, asSuperset }` in
`app.exerciseSearchResult`, and the hook whose request id matches applies it and clears it.

The live workout's callers share one id per session (`add-exercise:<sessionId>`). The All exercises sheet
closes itself before the picker opens, so its own hook is gone when the result arrives. The live workout
underneath uses the same hook with the same id and adds the pick instead. A hook checks the store again
before applying, so two mounted callers never both add it.

The routine or workout's name and exercise ids travel as route params, so a row can say "already in Push".

## The list

`pickerListOf` builds it from the catalog (`selectExercises`), the recent exercises and the filters.

- With no search: **Recent**, then every other exercise by name. Recent is the five exercises logged most
  recently, newest first (`recentExerciseIds`, from `storedSessions.latestExercises`).
- With a search: the fuzzy matches (`models/exercise-fuzzy-match.ts`), best first, and Recent has no section of
  its own. If no exercise in the whole catalog is named exactly what was typed, a **Create "X"** row ends
  the list. If one is but the chips hide it, the row offers to clear the chips instead, so a filter never
  leads to a duplicate. If nothing the chips allow matches, the screen says so and offers Create "X", or
  Clear filters when the chips hide a match.
- A new search or chip remounts the list, so it starts at the top.
- **Muscle chips** (All, Chest, Back, Shoulders, Arms, Legs, Core) group the catalog's muscles (`muscleGroupOf`), labelled by `muscleGroupLabel`, which All exercises' chips share. An exercise
  files under its first primary muscle (`ExerciseDescriptor.primaryMuscles`). Filing by any muscle would put
  every press and row under Arms, through their secondary muscles. Neck is under All only.
- **Equipment chips** use the catalog's own words, labelled from the same `exercise.equipment.*` keys as
  each row's meta, so a chip and its rows read alike ("Bodyweight" for `body only`). An E-Z bar counts as a
  barbell, and anything outside the list (foam roll, medicine ball, none) as Other.

## New exercises

**New**, or Create "X", opens a form in the picker with the name (prefilled with the search), the muscles
(all primary; the first one tapped is the main one) and the equipment. The muscle and equipment chips that were on start
it off when they name one. Create saves it as a custom exercise and picks it: added to the selection, or,
when swapping, picked straight away.

Custom exercises store equipment in the field every exercise already has (`ExerciseDescriptor.equipment`),
so there is no migration. Settings > Exercises edits it too, and adds a new exercise with an empty name
and a placeholder, listed as Unnamed exercise until it has one.

## The built-in library

About 870 exercises from `wrkout/exercises.json` (`app/assets/sources.txt`). It is big but hard to search
with gym names: there is no plain "Bench Press" or "Overhead Press", only "Barbell Bench Press - Medium
Grip" and "Standing Military Press". Growing or curating it is separate work.
