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
- Typing replaces the placeholder. Backspacing the last character shows the placeholder again, and so does
  backspacing to the 0 that a leading `.` puts in front of itself.
- `.` is offered only when the field allows decimals (weight, not reps). A field takes up to four whole
  digits and two decimals.
- ± steps from what was typed, or from the placeholder if nothing was typed. It stays within what typing
  can reach (0 to 9999.99, two decimals at most). Typing straight after ± replaces the stepped value, as it
  replaces the placeholder; backspace edits it.
- `numberPadValue` is what logging the field would record: what was typed, or else the placeholder.

## Steps

The ± step depends on the exercise's equipment (`models/equipment.ts`):

| Equipment | kg | lb |
| --- | --- | --- |
| barbell | 2.5 | 5 |
| dumbbell | 2 | 5 |
| cable, machine | 2.5 | 5 |

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

## Trying it

In a dev build, open `liftlog://dev/number-pad`. Query parameters pick the starting state:
`unit=kilograms|pounds`, `field=weight|reps`, `equipment=barbell|dumbbell|cable|machine|unknown`,
`theme=light|dark`. The screen also has controls for each.
