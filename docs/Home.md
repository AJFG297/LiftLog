# Home and the tabs

The tab bar and the Home screen, PM-24 of the [redesign plan](./plans/redesign.md) (decision D4).

## The tabs

Home · Routines · Progress · You, in `app/src/app/(tabs)/_layout.tsx` (native tabs). The route folders
kept their names, so every existing link still resolves:

| Tab | Folder | What it holds |
| --- | --- | --- |
| Home | `(session)/` | Home, the workout screen and its sheets, and `history/`: All history (`/history`, the month list that used to be the History tab) and the workout editor (`/history/edit`). |
| Routines | `routines/` | For now the plan list from `settings/program-list.tsx`, until PM-26 builds the Routines screen. Opening a plan still goes to `/settings/manage-workouts/...`, which is in the You tab's stack. |
| Progress | `stats/` | The stats screens, relabelled. |
| You | `settings/` | A profile card, then the settings, then Feed when `showFeed` is on. |

The feed isn't a tab any more. It lives in `app/src/app/feed/`, on the root stack over the tabs, so
`/feed/...` links (a shared item from `app.liftlog.online/feed/shared-item/...`) keep their URLs and now
open with the feed switched off too. The root layout's `initialRouteName` puts the tabs under a deep link.
History and the feed moved out of the tab bar rather than being hidden tabs, because a hidden native tab
can't be the focused one (expo-router throws in development and shows the first tab in production).

## Home

`components/smart/home.tsx`, drawn from `components/presentation/home/`.

- **Header.** Today's date, "Your training", and the streak chip: `selectStreakStats`' completed weeks, plus
  this week once it's met the target, as the old streak card counted it. No streak, no chip.
- **Up next.** The first of `program.upcomingSessions`: the active plan's next workout as progression built
  it. It says which day of the plan it is, its first two exercises, a time estimate and when it was last
  done. Start opens it straight away, so it's one tap. Other opens a sheet (`/other-workout`,
  `components/smart/other-workout-sheet.tsx`) listing the plan's other workouts, each started with one tap,
  and All routines; with a one-workout plan it goes straight to Routines. The canvas links Other to
  Routines, but Routines can't start a workout until PM-26, and this keeps every plan day one tap away.
  Freeform workout sits under the card. While a workout is in progress the card and Freeform workout are hidden and the bar below
  takes over. With no workouts in the plan, the card offers Choose a routine and Freeform workout.
- **Last 7 days / Last 30 days.** A summary of workouts, volume (tonnes, or thousands of pounds in
  imperial) and time. Under it, 7 days is a strip of day circles and 30 days a five-by-seven calendar with
  a legend. Each column of the calendar is one weekday and its last row is the strip, so both views end on
  today, which is ringed with a dashed accent line. A day with a workout is filled in its routine colour.
- **History.** A card per workout in the range, newest first: date, routine colour, name, a PR badge when
  it set a personal record (`selectHistoryPersonalRecords`), length, volume, sets and its first three
  exercises. The 7-day view adds a thin row for each day without one. A card opens
  `homeWorkoutHref(sessionId)`, the workout editor for now; the workout detail screen (PM-25) swaps in
  there. All history opens `/history`.
- What's New and the welcome wizard render at the top as they did on the old Home.

### Where the numbers come from

Nothing new is stored. The ranges read `selectOwnSessionsByDate`, the grouping the old activity calendar
draws: finished workouts where something counted was logged, keyed by the day they were done. A test
(`models/home/history-range.spec.ts`) holds the 30-day view to `selectActivityMonth`'s day counts. Volume
is `sessionVolume`, the calendar's own measure. A workout's length is from its first set to its last, so a
workout with one logged set has none and is left out of the time and the average.

The time estimate (`estimatedMinutesOf`) is the median of the last five times the workout was done, which
already reflects how long this person rests. A workout never done is estimated from its plan: each set at
40 seconds plus its rest. Both round to 5 minutes.

Home stays mounted under the workout screen, so it reads the whole-history selectors with
`useAppSelectorWhenFocused` and the workout in progress only as "is there one", and a logged set doesn't
make it recompute.

### Routine colours

Routines have no colour of their own yet, so `routineColorOf` derives one: the active plan's workouts take
`ROUTINE_COLORS` in plan order, and anything else (an older plan, a freeform workout) is coloured by a hash
of its name, so a name keeps its colour. The colours are fills under white day numbers, so each goes through
`accentFill`, which keeps white text on it at 4.5:1. They never follow the accent.

## The workout-in-progress bar

While a workout is minimised, `WithWorkoutInProgressBar` (`components/smart/workout-in-progress.tsx`) puts a
bar under every tab's stack, just above the tab bar. It takes its own space rather than floating, so it
never covers a screen's content or its bottom buttons. It hides on the workout screen and its sheets.

It shows the workout's name, the time since the first set, the next set and, while resting, the countdown
from `restWindowOf(session)`, which turns to Go when the rest is over (nothing with rest timers off).
`workoutInProgressNextOf` reads the next set the way the rest pill does, from the page on screen
(`app.liveWorkoutFocus`), and adds the working-set count: "Bench Press · set 3 of 5 next". Tapping the bar
opens the workout on that same page. Its menu has Resume and Clear current workout, which discards the
workout after a confirmation.

## Code

- `models/home/history-range.ts`: the days, summary, history entries and 30-day grid of a range, and a
  workout's card facts.
- `models/home/up-next.ts`: the time estimate, last done, and name previews.
- `models/home/routine-colors.ts`: `ROUTINE_COLORS` and `routineColorOf`.
- `models/home/workout-in-progress.ts`: what the bar says is next.
- `components/smart/home-workout-href.ts`: where a history card goes.
- `components/smart/up-next-text.ts`: the Up next line, shared by the card and the Other sheet.
