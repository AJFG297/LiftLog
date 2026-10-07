# Routines

A **program** is a list of **routines** (a `ProgramBlueprint` of `SessionBlueprint`s) that repeat in order.
One program is active: its next routine is what Home offers to start. This doc covers the Routines screen,
the program page and the routine editor (decisions D4, D5 and D8 in the [redesign plan](./plans/redesign.md),
issue PM-26). For how numbers move between workouts, see [Progression.md](./Progression.md).

## The Routines screen

`components/smart/routines-screen.tsx` (`RoutinesScreen`), the Routines tab's `app/(tabs)/routines/index.tsx`
(`/routines`, `?focusprogramId=` to show one of the saved programs). The program page and the routine editor are
routes in the same tab (`routines/manage-workouts/`), so they open in its stack with the tab still selected, and
Back returns to the Routines screen. Link to them with `programHref` and `routineEditorHref`
(`components/smart/routines-href.ts`).

The plan import (`routines/import-plan-info`, then the preview at `routines/import-plan`, where `PlanImportGate`
sends a parsed file from any tab) is in this tab too, and so is a second route to the AI planner
(`routines/ai/planner`, the same screen as You's `settings/ai/planner`), so Build with AI, Import a plan and a
new routine's Describe it and Import open on top of what's there and Back returns to it.

To show the Routines screen from anywhere, use `useGoToRoutines()` (`hooks/useGoToRoutines.ts`), not a link to
`/routines`. From another tab that link pushes a second Routines screen whenever a program or routine is open in
this tab. The hook closes what's open over the tabs, cuts the Routines stack back to the Routines screen and
selects the tab (`goToRoutinesActions` in `models/home/go-to-routines.ts`). Saving an import, an AI plan or a
shared program goes there, on the new program. An unsaved routine editor in the stack asks before it's dropped.
Saving an import leaves the import screens first, so Keep editing goes back to that editor. From the top:

- **Title row** with **New routine** (+), which opens an empty routine at the end of the active program.
- **Active program**, a dark card: its progress, a tile per routine showing **Next** or the day it was last
  done, **Edit** (the program page) and **Start {next routine}**. "Next" is the first of the upcoming sessions
  Home also uses. A day counts as done only if a set was logged, and freeform workouts don't count.
- Programs repeat with no set length, so there is no "week 4 of 6". Progress is the place in the current
  round instead: "Day 2 of 3 · 12 workouts done", with a bar for the routines done this round. Workouts are
  counted by routine name, like the last-done dates (`workoutsDoneOf`).
- **My routines**: the active program's routines, each with its colour, exercises, set count, estimated time
  and last done. Tap to edit, ▶ to start that routine now (asking first if another workout is in progress).
- **Start an empty workout**: a freeform workout.
- **Your programs**: the other saved programs, saved built-ins included, sortable by name or most recent,
  plus **New program** and **Import a plan**. Tapping a program opens it. Its menu has Edit, Use this program,
  Duplicate, Share, Export and Remove (not for the active one).
- **Find a program**: only the built-in programs that aren't saved (`unsavedBuiltInPrograms`), then **Build
  with AI** (the AI planner). The first launch saves every built-in, so until one is removed this section shows
  only Build with AI. Tapping a built-in here saves it again and opens its page. Each program is listed once.

Two rules keep a tap from doing something big by accident (PM-35):

- Nothing floats over the list. Every control is in the scrolling content, so no button sits on top of a row,
  and the last row scrolls fully into view.
- Changing the active program is never one tap. It's only offered as **Use this program**, in a program's
  menu or on its page, and it asks first (a native alert). Afterwards a toast offers Undo.

## The program page

`components/smart/program-editor.tsx`, at `routines/manage-workouts/[programId]`: the program's name (saved
as you type), Use this program or a note that it's the one in use, and its routines in order, each with its colour, with
move up and down, Duplicate, Copy to another program and Remove (with Undo). **New routine** at the end opens the routine
editor on a new routine. If the program is removed while its page is open, the page goes back (`useBackWhenGone`).

## The routine editor

`components/smart/routine-editor.tsx`, at `routines/manage-workouts/[programId]/manage-session/[sessionIndex]`
(add `?new=1` with the index one past the end for a new routine).

### Draft, Save and Cancel

The editor edits a **draft** (`components/smart/routine-draft.ts`), not the plan. Save writes it with
`updateProgram` and stamps the program's `lastEdited`; Cancel, the back gesture or the Android back button
throws it away, asking first when anything changed. For a new routine, Save needs a name and one exercise.

The draft lives in a small module-level store keyed by program and routine index, so the other routes the
editor opens edit the same draft:

- **More options** opens the edit exercise sheet (`app/routine-exercise-editor.tsx`, a root form sheet, the
  same editor the live workout opens): swap the exercise, weighted or cardio, the targets, warm-ups, rest,
  progression, load, superset, notes, link, and Copy to another routine. Its first line says the change goes
  into the routine when the routine is saved, and its button is Done. Opened on its own, with no editor
  behind it, it edits the saved routine directly, says so, and its button is "Save to <routine>". The
  editor holds the exercise in `exercise-edit-draft.ts` so the sheets it opens over itself (Load, Warm-ups) edit it
  too. The Warm-ups row opens the warm-up sheet (`app/exercise-warmups.tsx`): W1, W2… with load and reps
  on the number pad, a percentage shown with what it works out to, and one-tap ramps (Standard, Quick, Heavy
  day) when there are none.
- The **set-type sheet** (`app/routine-set-type.tsx`, a root form sheet) changes one set's type.

Two editors can be open on one routine, one from Routines and one from the Workout tab's upcoming card. They
share the draft, it lasts until the last of them closes, and Save in one leaves nothing unsaved in the other.

The draft also keeps one key per exercise, so an open card stays open while exercises move.

### The screen

- A **name and notes** card with the routine's **colour** and a live summary: "Day 2 of Push Pull Legs · 5 exercises · 16 sets · ~50 min".
  The estimate is 45 seconds per set plus its rest, rounded to 5 minutes.
- With no exercises, **four starts**: Pick exercises (the [exercise picker](./ExercisePicker.md)), Describe it (the AI planner),
  Import (plan import) and Start from a program (the Routines screen). The last three build whole programs
  for now.
- **Exercise cards**, collapsed to a summary ("1 warm-up + 4 × 5 · 87.5 kg · rest 2:30") and a progression
  tag. Exercises from the picker land in the order they were tapped, linked when picked As superset, each
  3 × 10 with 1:30 rest and no rules. The first of them opens expanded.
- Expanded, a card has the **set rows**, **rest**, **progression**, More options, and Move up, Move down,
  Superset or Unlink, and Remove (with an Undo toast).
- The **Ask AI to change this routine** bar is built but hidden (`ASK_AI_BAR_ENABLED` in `ask-ai-bar.tsx`)
  until the AI routine builder (PM-33) lands.

### Colour

Six swatches from the canvas: vermilion, green, blue, ochre, purple and stone (`models/routine-color.ts`). The
blueprint stores the name (`SessionBlueprint.color`, blueprint v10), so the shades can change without touching
saved plans. A routine with no colour, including every routine from before v10, shows the one for its place in
the program, so a three-day split starts out vermilion, green and blue. The colour is the routine's own and
never follows the app's accent (D2).

### Set rows

Warm-ups come first, then the working list, as in the workout. The badge (`SetBadge`) opens the set-type
sheet. A set that becomes a warm-up moves to the end of the warm-ups, and a warm-up that stops being one
becomes the first working set. The last working set can't be removed or made a warm-up. **Add set** adds a
working set on the last one's reps. The logic is in `routine-sets.ts`.

Reps and warm-up loads are typed on the **number pad** (D8), in the screen, like the workout. What's typed is
written when the field is left: Next, Hide, another field, or Save. Next walks each row's fields in order (a
warm-up's load, then reps, then the top of a rep range) and closes after the last. A warm-up's load is a
percentage or a weight, as the plan has it; switching between them is in More options.

A routine doesn't plan working weights: weight carries over from the last workout (see
[Progression.md](./Progression.md)). So the weight column shows, in the placeholder colour, the weight the
next workout will open on (`SessionService.hydrateSessionFromBlueprint`), and a line under the table says so.
With no history it says the first workout sets them.

### Rest (D5)

One rest time, the minimum, from presets (1:00 to 3:00). **Advanced** holds all three times the timer uses:
the shortest rest, the longest, and the rest after a missed set, in 15-second steps. A preset keeps the
longest rest at least as long as the shortest (`withMinRest`). Rest is hidden when rest timers are off.

### Progression presets

`routine-progression.ts` maps three presets onto the existing rules, and reads them back from the rules:

| Preset | Rules |
| --- | --- |
| Add weight | one load rule on every set |
| Reps, then weight | reps +1 on every set up to a limit, starting over, then the load rule |
| Off | none |

- The load step is the exercise's own if it has a load rule, otherwise the equipment's (`weightStepFor`).
- The rep limit is the exercise's own while it's above the plan's reps, otherwise the plan's top reps plus 4
  (`defaultCeilingFor`). Raising the reps to the limit moves the limit up, so the ladder can still climb.
- Any other list of rules reads as **Custom**. Picking a preset replaces it.
- Each preset explains itself with the exercise's numbers, such as "Build from 8 to 12 reps. Once every set
  hits 12, add 2.5 kg and start again at 8."
- **Advanced** opens the full rule editor (`progressive-overload.tsx`). An exercise with no resistance has
  nothing to add weight to, so it shows only that editor.

### Moving and supersets

`routine-order.ts` moves exercises a **block** at a time: a lone exercise, or a whole superset.

- A superset moves as one unit.
- A lone exercise hops over a whole superset, so a group never splits.
- **Superset** links an exercise to the next one, joining that one's superset if it's in one. **Unlink**
  unlinks the whole superset.
- Removing a superset's last exercise clears the link on the one before it, so the superset doesn't join the
  next exercise.
- A superset flag left on the routine's last exercise links nothing. It's cleared when a move puts something
  after it.

Only weighted exercises can start a link, as in the workout.
