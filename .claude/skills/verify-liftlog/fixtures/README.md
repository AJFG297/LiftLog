# Fixtures

A fixture is a saved copy of the app's user data that `verify.sh seed <name>` restores on this checkout's slot,
so a check starts from known plans and history in about a minute instead of tapping them in. See "Seed data"
in [`../SKILL.md`](../SKILL.md) for the commands, where fixtures are stored and when they're remade.

Each fixture below is made by a **seed flow**, `../flows/seed-<name>.yaml`, run on a cleared app by
`verify.sh fixture <name>`. The binaries aren't in git: `seed` makes a fixture the first time this checkout's
storage code needs it. **When you change a seed flow, update its section here in the same change.**

## `ppl-history`

Made by [`seed-ppl-history.yaml`](../flows/seed-ppl-history.yaml), with the helpers in `../flows/seed/`. It takes
about 17 minutes. Dates count back from the day it was made.

Settings:

- **Log RPE** is on (You → App configuration). Everything else is the default: kg, rest timers on, the
  welcome wizard done, What's New all seen.

Custom exercise:

- **Seed Cable Fly**: chest, cable. It was created from the exercise picker while building Push.

Programs:

- **Seed PPL** is the active program. Home's Up next card offers **Push**.

  | Routine | Exercises (in order)                                                                    |
  | ------- | --------------------------------------------------------------------------------------- |
  | Push    | Barbell Bench Press - Medium Grip, Seed Cable Fly (superset A), Standing Military Press |
  | Pull    | Barbell Deadlift, Bent Over Barbell Row                                                 |
  | Legs    | Barbell Squat, Leg Press                                                                |

  Every exercise is 3 × 10 with 1:30 rest. Each routine's first exercise also has one warm-up set (50%) and
  progression set to Add weight (2.5 kg once every set meets its target). The others have no progression.

- **Seed Full Body** isn't active. Its one routine, **Full Body**, has Barbell Squat (1 warm-up + 3 × 10, Add
  weight) and Pushups (3 × 10).
- The preset programs the app installs (Starting Strength, Stronglifts 5x5, PPL, PHUL, the two calisthenics
  plans, Cardio) and the empty **My Plan** are there too.

History: six finished workouts, every set logged as planned, each rated Good on the summary.

| Days ago | Routine | Weights (kg)                                         | RPE               | Personal record     |
| -------- | ------- | ---------------------------------------------------- | ----------------- | ------------------- |
| 13       | Push    | bench 60 (warm-up 30), fly 20, military press 40     | bench Set 1: 8    | none, first workout |
| 11       | Pull    | deadlift 90 (warm-up 45), row 50                     |                   | none, first workout |
| 9        | Legs    | squat 80 (warm-up 40), leg press 90                  |                   | none, first workout |
| 6        | Push    | bench 62.5 (warm-up 32.5), fly 20, military press 40 | bench Set 1: 8    | bench press         |
| 4        | Pull    | deadlift 92.5 (warm-up 47.5), row 50                 | deadlift Set 1: 9 | deadlift            |
| 2        | Legs    | squat 82.5 (warm-up 42.5), leg press 90              |                   | squat               |

So the fixture holds 6 workouts, 6 completed warm-ups (half the working weight, rounded to the plates) and 42
logged working sets, 3 of them with an RPE. No workout is in progress. Today and yesterday have no workout, so a
check can log today's without a clash.

Check it after seeding:

```bash
verify.sh db "select date, name from workout order by date;"
verify.sh db "select json_extract(payload,'$.name') from program where json_extract(payload,'$.name') like 'Seed%';"
```

## `empty`

Made by [`seed-empty.yaml`](../flows/seed-empty.yaml) in about a minute: a cleared app taken through the
welcome wizard to Home. No workouts, no custom exercises, the preset programs, and the empty **My Plan** as the
active program, so Home shows "No workouts in your plan yet". Unlike `clear`, seeding it keeps the dev client's
state, so it lands straight on Home.
