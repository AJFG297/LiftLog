# Number pad

Weight and reps in the live workout are typed on our own number pad, not the system keyboard (decision D8
in the [redesign plan](./plans/redesign.md)). It's an in-screen panel that slides up with Reanimated, so
the set being edited stays visible. The code is in
`app/src/components/presentation/foundation/number-pad/`.

## How a field behaves

The buffer is a pure reducer, `numberPadReducer`, and the `NumberPad` component is a view over it: the
screen owns the buffer (`useReducer(numberPadReducer, field, openNumberPad)`) and passes the pad's
actions to it.

- Opening a field (`openNumberPad`, or the `reset` action for the next field) starts it empty, showing
  the placeholder: today's target.
- Typing replaces the placeholder. Backspace edits the displayed value, including a reopened field.
  Deleting the last digit leaves the field blank while editing; leaving or logging a cleared workout field records
  zero. Further backspaces keep it blank, and typing or ± starts from zero.
- `.` is offered only when the field allows decimals (weight, not reps). A field takes up to four whole
  digits and two decimals.
- ± steps from what was typed, or from the placeholder if nothing was typed. It stays within what typing
  can reach (0 to 9999.99, two decimals at most). Typing straight after ± replaces the stepped value, as it
  replaces the placeholder; backspace edits it.
- `numberPadValue` is what logging the field would record: what was typed, or else the placeholder.

## Partial reps

While editing live workout reps, tap **P** in the number pad to edit a separate partial count to the
right of full reps. Tap **P** again or tap the full-rep field to return to full reps. The check logs both
counts. Backspace away the partial count (or enter 0) to clear the extra field when you leave it.
A partial-only set uses 0 full reps.
Logged counts read as one compact value, such as `10+2P`. Tap it to reopen the separate fields.
Partials stay with the set through edits and undo, but start empty on added sets and future workouts.

## Steps

The ± step depends on the exercise's equipment (`models/equipment.ts`):

| Equipment      | kg  | lb  |
| -------------- | --- | --- |
| barbell        | 2.5 | 5   |
| dumbbell       | 2   | 5   |
| cable, machine | 2.5 | 5   |

Anything else (kettlebells, bands, an e-z curl bar, a custom exercise with no equipment) uses the
blueprint's weight increment and shows nothing in the accessory row. An e-z curl bar is plate-loaded, but
it's far lighter than the bar in the preferences, so plate maths for it would be wrong. `equipmentClassOf`
maps the exercise descriptor's `equipment` string.

## The accessory row

The row above the keys explains the value being typed:

- **Barbell:** the plates for each side, with a drawing of them. `platesFor(weight, bar, plates)` in
  `models/plates.ts` uses the fewest plates, heaviest first, assuming any number of each size. A weight it
  can't make exactly gets the heaviest load under it and says how far short that is. A weight lighter than
  the bar says so. The drawing shows up to eight plates a side, then a count of the rest.
- **Dumbbell:** the weight is per dumbbell. **Cable and machine:** the weight is what's on the stack.
- **Reps:** RPE chips, 6 to 10 in half steps. The row opens scrolled to its right end, so 8 to 10 are in
  view, or to the chip already picked. Tapping the selected chip clears it.

## Bar and plates

The bar weight and the plates a gym has are preferences, one of each per unit (`barWeight` and
`availablePlates`), edited in You → App configuration → Bar and plates. Defaults: a 20 kg bar with
25, 20, 15, 10, 5, 2.5 and 1.25 kg plates, and a 45 lb bar with 45, 35, 25, 10, 5 and 2.5 lb plates. Like
every preference, they aren't in backups (see [Storage.md](./Storage.md)).

## In the live workout

The workout screen mounts the pad under the page, in place of the Up next dock, and passes `bottomInset`:
iOS keeps the bottom safe-area inset, and Android, whose screen already ends above the tab bar, keeps
none. Plate maths shows only for a load on external resistance; bodyweight exercises get no accessory.
See [LiveWorkout.md](./LiveWorkout.md#logging-a-set).

## In the routine editor

The routine editor mounts the same pad for reps and warm-up loads (a percentage steps by 5 with no
decimals; a weight steps by the equipment, with plate maths). What's typed is written to the draft when the
field is left, and the primary key is always Next, closing the pad after the last field. A routine plans no
working weights, so those cells only show what carries over. See [Routines.md](./Routines.md#set-rows).

## In the edit exercise sheet

The Targets card's Sets and Reps tiles, and the sets of Per set, are typed on the sheet's own pad,
`TargetsNumberPad` (`components/presentation/workout-editor/targets-number-pad.tsx`): the value with − / +,
common-value chips, the digits, then Next and Done. It is presentational; `weighted-targets-editor.tsx`
drives it from `targetsPadReducer` in `exercise-targets.ts`. The first key press replaces the value, and
each key press applies the field to the exercise as it was when the field opened, so the stored targets are
always in bounds (at least 1, a range's top at least its bottom) while the pad shows what was typed. Next
walks Sets → Reps (in Range, the bottom, then the top) and Per set set by set, then closes. In Range, "–"
moves to the top, and both ends in the pad's display can be tapped to edit that end.

Time & distance drives the same pad from `cardioPadReducer` in `cardio-targets.ts` (view:
`cardio-targets-editor.tsx`). Same each round has Rounds and the goal tiles, and the goal is written to every
round; Different each round edits one round at a time, Next stepping round by round. Minutes are whole
numbers (an untouched round of 1:30 keeps its seconds). A distance is typed in the user's unit (km, or miles
when imperial) with the key left of 0 as a decimal point, at most two decimals, and − / + step by 0.5. Next
after the last field reads "Next: Rest" only when there is a Rest between rounds row; otherwise Done fills the
row.

## Trying it

In a dev build, open `liftlog://dev/number-pad`. Query parameters pick the starting state:
`unit=kilograms|pounds`, `field=weight|reps`, `equipment=barbell|dumbbell|cable|machine|unknown`,
`theme=light|dark`. The screen also has controls for each.
