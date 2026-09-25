# History

The History tab shows a training streak card, a month calendar shaded by volume, and the sessions for the selected
day or month. From a past session a user can edit it (including its date), delete it after confirming, share it, or
start it again as a new workout, and add a workout on a day that has none.

## Sub-features

- `history-streak` shows `N week streak` and training days in the last 7.
- `history-calendar` navigates months (`calendar-nav-previous-month` / `calendar-nav-next-month`) and selects a day.
- `history-summary` lists each session's exercises as `reps @ weight` lines.
- `history-edit` opens a past session in the editor; `session-date-input` changes its date.
- `history-delete` removes a session after `Delete Workout?`.
- `history-restart` starts a past session again (`Start this workout`), replacing any in-progress one after confirm.
- `history-add-on-day` adds a workout on an empty day (`history-add-workout-on-day`).

## How to get to it (user POV)

- Bottom tab `History`.
- Finishing a workout leads there naturally; see [Workout session](./workout-session.md).

## Driving it with Maestro

Preconditions:

- Baseline from the [index](./README.md), plus at least one finished session. If
  `verify.sh db "select count(*) from session where active=0;"` is 0, run the workout-session flow first.

- **Open.** `tapOn: 'History'` → `assertVisible: {id: 'session-summary-title'}` and `assertVisible: '.*week streak'`.
- **Summary line.** `scrollUntilVisible: {element: {text: '.*7\.5kg'}, direction: DOWN}` for the session logged by
  `completing-a-session.yaml`.
- **Calendar.** `tapOn: {id: 'calendar-nav-previous-month'}` → a month with no sessions shows
  `No workouts in <month>`-style empty text; `tapOn: {id: 'calendar-nav-next-month'}` returns. Days are tappable by
  their number (`content-desc`), e.g. `tapOn: '25'` scoped with `below: {id: 'calendar-month'}` if needed.
- **Edit.** `tapOn: {id: 'history-edit-workout'}` → the editor opens with `session-date-input`; change a value, `back`,
  and the summary reflects it.
- **Delete.** Tap the card's delete icon (tooltip `Delete`), then confirm `Delete` in `Delete Workout?`. The card is
  gone and `verify.sh db "select count(*) from session where active=0;"` drops by one.
- **Proof.** `verify.sh ui history` lists `history-list`, `session-summary`, `session-summary-title`,
  `history-edit-workout`, and the summary `text` values; pair it with a `takeScreenshot`.

## Gotchas

- The dev client's floating grey gear sits over the top-right header area; do not tap by coordinates there.
- Icon buttons in the session card (share, start, delete) have no testIDs of their own; target them by their tooltip
  text/`content-desc`, and use `verify.sh ui` to confirm what is exposed on your build.
- Only the selected day's (or month's) sessions are listed; a session from a previous month needs calendar
  navigation first.
- Deleting is destructive to the emulator's data only; still, delete only sessions your run created.
