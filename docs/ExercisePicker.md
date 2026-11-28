# Exercise picker

The screen for choosing exercises (PM-32, step 13 of the [redesign plan](./plans/redesign.md)). It is one
route, `app/exercise-search.tsx`, drawn by `components/smart/exercise-search.tsx` (`ExerciseSearch`), with
its list logic in `components/presentation/workout-editor/exercise-picker.ts`, with pick construction in
`models/exercise-pick.ts`. The parts All exercises
shares live outside the picker: the search (`models/exercise-search.ts`, see [Search](#search)), the muscle groups
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
- **Swap** picks one: the tap closes the picker. The swapped exercise's id travels as a route param
  (`exerciseId`), and the picker opens with an empty search and a **Similar** section on top (see below).

What was picked lands at the end of the routine or the workout as 3 × 10 with 1:30 rest and no progression
rules (`blueprintsForPick` in `models/exercise-pick.ts`). A superset flag left on the old last exercise linked nothing, and would join
the new ones, so it's cleared (`withPickAppended`, `sessionWithPickAdded`). In the routine editor the first
exercise added opens expanded; in the live workout the screen moves to it.

In a workout, each exercise added opens on the numbers a routine would give it at that place: last time's
weight carried over, and the second of an exercise already in the workout on that exercise's second place
last time (see [Progression.md](./Progression.md)). A swap keeps the plan (sets, reps, rest) under the picked
exercise and opens it the same way, keeping any set already logged (`sessionWithExerciseSwapped`). Both carry
from the carry-over cache without the workout's own entries (`ExerciseEntry`). When the cache's entry for an
exercise is the workout's own (a set of it logged today), it holds nothing from before, so just those exercises
are read from the tables without this workout (`latestPerLineage` with `excludeWorkoutId`) before the pick
lands. If that read fails, they open on the cache as it is, today's numbers included, and the failure is
logged. Picks for one workout land in the order they were made, so a pick made during a read waits behind it.
A pick lands in the workout it was picked for, and a swap only if that place still holds the exercise swapped
out. An edit of its plan meanwhile, such as Add set, is kept. The screens call the per-store `ExerciseEntry`
owner through `services.exerciseEntry`. It owns add, swap and editor carry-over reads, target capture and
ordered application. An editor captures its target when dismissed and applies only while that exact
blueprint still occupies the slot.

## How the result comes back

The picker is its own route, so it can't call back. It puts `{ requestId, exercises, asSuperset }` in
`app.exerciseSearchResult`, and the hook whose request id matches applies it and clears it.

The live workout's callers share one id per session (`add-exercise:<sessionId>`). The All exercises sheet
closes itself before the picker opens, so its own hook is gone when the result arrives. The live workout
underneath uses the same hook with the same id and adds the pick instead. A hook checks the store again
before applying, so two mounted callers never both add it.

The routine or workout's name and exercise ids travel as route params, so a row can say "already in Push".

## The list

`pickerListOf` builds it from the catalog (`selectExercises`), the exercises the user has logged and the
filters. The logged exercises are every one with history, newest first (`loggedExerciseIds`, from
`storedSessions.latestExercises`).

- With no search: **Recent**, then every other exercise by name. Recent is the first five logged exercises.
- Swapping, with no search, **Similar** comes first: up to eight exercises filed under the swapped one's
  muscle group (`muscleGroupOf`). Those with its main muscle (the first primary one) come first, so a squat
  lists squats and lunges before calf raises. Then the recent ones, so a recent leg press makes it when
  swapping a squat, then those on the same equipment (`equipmentChoiceOf`), then by name. An exercise with no
  muscle group, such as a stub the AI planner or an import made, has nothing to file under, so Similar lists
  what a search for its name finds instead: a stub "Bench Press" opens on Barbell Bench Press. The swapped
  exercise is never in Similar or Recent. Each exercise is listed once: one in Similar is left out of Recent
  and of the rest. `pickerListOf` takes the swapped id as its optional fourth argument (`{ swapping }`).
- With a search: the matches (see [Search](#search)), best first, and Recent has no section of its own, but
  every exercise with history gets a small boost: it moves ahead of an otherwise equal match, never ahead of
  a better-matched word or a whole name. History is the signal, not who made the exercise: a built-in done
  every week is boosted, and a stub that was never done isn't, so it doesn't pull picks away from the
  built-in it stands for. A query with no words, such as "(", counts as no search. If no exercise in the whole catalog is named exactly what was typed, a **Create "X"** row ends
  the list. If one is but the filters hide it, the row offers to clear the filters instead, so a filter never
  leads to a duplicate. If nothing the filters allow matches, the screen says so and offers Create "X", or
  Clear filters when the filters hide a match.
- A new search, chip or equipment remounts the list, so it starts at the top.
- **Muscle chips** (All, Chest, Back, Shoulders, Arms, Legs, Core) group the catalog's muscles (`muscleGroupOf`), labelled by `muscleGroupLabel`, which All exercises' chips share. An exercise
  files under its first primary muscle (`ExerciseDescriptor.primaryMuscles`). Filing by any muscle would put
  every press and row under Arms, through their secondary muscles. Neck is under All only.
- **Equipment** is one pill under the muscle chips. It reads Any equipment and opens a native menu, with a
  checkmark on the current choice. Once one is chosen, the pill takes its name and the accent fill. The
  choices use the catalog's own words, labelled from the same `exercise.equipment.*` keys as each row's
  meta, so the pill and its rows read alike ("Bodyweight" for `body only`). An E-Z bar counts as a barbell,
  and anything outside the list (foam roll, medicine ball, none) as Other.
- **The count** sits beside the pill: how many exercises the list shows ("94 exercises"), so a filter's
  effect is visible before scrolling (`PickerList.count`).

## Search

One matcher, `searchScores` in `models/exercise-search.ts`, serves the picker, Settings > Exercises
(`filterExercises`) and Progress > All exercises (`exercisesListOf`). Each list keeps its own filters and its
own order for ties.

- **Words, not letters.** Names and queries are split into words the same way: accents, case and apostrophes
  are dropped, and spaces and `- / ( ) , . + : ; & _` all break words. Every word is made singular with the
  resolver's plural rules (`singularWord` in `exercise-name.ts`), so "squats" meets Squat and "flies" meets
  Flyes. `db`, `bb` and `kb` are spelled out as dumbbell, barbell and kettlebell.
- **Aliases.** `models/exercise-aliases.ts` gives about 40 built-ins the names people use in the gym ("ohp",
  "rdl", "bench", "skull crusher", "pec deck"), keyed by built-in id. Each alias is matched like a second
  name, so a custom exercise or a Stats row finds them through its built-in id. Keep an alias on the one
  exercise most people mean by it; a spec checks every key is a catalog id.
- **Every query word must match** a word of the name or of one alias, in any order. A word matches exactly,
  as the start of a name word ("sq" for Squat), with a typo, or inside one (three letters or more, scored
  lowest). Two query words may stand for one name word ("pull up" for Pullups) and one for two ("chinup" for
  Chin-Up).
- **Typos** are a bounded edit distance where swapping two neighbouring letters counts as one edit: one edit
  for a word of 4 to 6 letters, two from 7, none below 4 (one wrong letter in "row" is another word). It is
  checked against the whole name word and against its start, so "squet" finds Squat while it's being typed.
- **Ranking.** The words' average match, plus a bonus for covering more of a short name, a small one for
  keeping the name's word order, and a large one when the query is the whole name or a whole alias: "bench"
  ranks Barbell Bench Press - Medium Grip first.
- **Fallback.** When no exercise matches word by word, the old in-order letter match
  (`models/exercise-fuzzy-match.ts`) stands in, so an odd abbreviation still finds something.
- The catalog's search entries are built once per catalog object (a `WeakMap` cache), as the list is rebuilt
  on every keystroke.

## New exercises

**New**, or Create "X", opens a form in the picker with the name (prefilled with the search), the muscles
(all primary; the first one tapped is the main one) and the equipment. The muscle chip and equipment that were on start
it off when they name one. Create saves it as a custom exercise and picks it: added to the selection, or,
when swapping, picked straight away.

Custom exercises store equipment in the field every exercise already has (`ExerciseDescriptor.equipment`),
so there is no migration. Settings > Exercises edits it too, and adds a new exercise with an empty name
and a placeholder, listed as Unnamed exercise until it has one.

## The built-in library

About 870 exercises from `wrkout/exercises.json` (`app/assets/sources.txt`). Its names are formal: there is
no plain "Bench Press" or "Overhead Press", only "Barbell Bench Press - Medium Grip" and "Standing Military
Press". The aliases bridge the common gym names; growing or curating the catalog itself is separate work.
