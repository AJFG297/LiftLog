# Plan Files

LiftLog plans can be exported to, and imported from, `.liftlogplan` files. A plan file is plain JSON, so you can write one yourself, share one with a friend, keep one in version control - or have an AI write one for you.

To import a plan, either tap a `.liftlogplan` file on your device (LiftLog is registered to open them), or open the app and go to `Routines -> Import a plan`. That screen also takes a spreadsheet you already keep your program in; see [Importing a spreadsheet](#importing-a-spreadsheet).

To export one, open `Plans`, tap the `⋮` next to the plan and choose `Export to file`. LiftLog writes the `.liftlogplan` and hands it to the system share sheet, so you can save it to Files or Drive, AirDrop it, or mail it to yourself - whatever gets it somewhere you can reach it again.

## Importing a spreadsheet

`Routines -> Import a plan` also takes a spreadsheet: an Excel workbook (`.xlsx`) or a `.csv`. Google Sheets exports both (`File -> Download`), and so do Numbers and LibreOffice (`Export to -> Excel`). Older `.xls`, `.numbers` and `.ods` files can't be read directly; save them as `.xlsx` or `.csv` first.

LiftLog reads the routine table and shows you the plan before anything is added, so you can fix what it got wrong in the same screen as any other import. The plan is named after the file.

The table needs a header row with an **Exercise** column and at least one of **Sets**, **Reps** or **Sets x Reps**. Everything else is optional:

| Day  | Exercise       | Sets | Reps | Rest  | Weight (kg) | Notes         |
| ---- | -------------- | ---- | ---- | ----- | ----------- | ------------- |
| Push | Bench Press    | 4    | 6-8  | 3 min | 80          | Pause rep one |
|      | Overhead Press | 3    | 8-12 | 90    |             |               |
| Pull | Deadlift       | 1    | 5    | 5 min | 140         |               |
|      | Barbell Row    | 4    | 8    |       |             |               |

That imports as two routines, Push and Pull.

- **Headers** can be spelled a few ways, in any case: Day, Routine, Workout or Session; Exercise, Movement, Lift or Name; Sets; Reps, Rep range or Repetitions; Sets x Reps, Scheme or Prescription; Weight, Load, kg or lbs; Rest or Rest time; Notes or Comments. Columns can be in any order, and columns LiftLog doesn't know are ignored.
- **The header** doesn't have to be the first row. A title or a blank line or two above it is fine, as long as the header is within the first ten rows.
- **Routines.** With a Day (or Routine) column, its value names the routine and a blank cell means "same as above". Without one, each sheet is a routine named after its tab, and a sheet holding several tables, one per day, makes a routine per table, named by the line just above its header (`Day 2 - Pull`). A single routine from a CSV, or from a tab still called `Sheet1`, takes the plan's name.
- **Sets** is a number. **Reps** is `8`, a range `8-12`, or a list per set, `12, 10, 8`. **Sets x Reps** is `3x8`, `3 x 8-12`, `5X5` or `4 sets of 10`, and can go in the Sets or Reps column too.
- **Reps LiftLog can't hold exactly**, such as `AMRAP`, `8+` or `10 each side`, are imported as the number they start with (or the default of 10), and the original text is kept in the exercise's notes so nothing is lost.
- **Rest** is `90` or `90s` (seconds), `2 min`, `1:30`, or a range like `2-3 min` (its lower end). A bare number under 10 is read as minutes; put the unit in the header, `Rest (sec)` or `Rest (min)`, to say otherwise.
- **Weight** goes into the exercise's notes (`Weight (kg): 80`), since a routine has no starting weight. Log it on the first workout and progression carries it from there.
- **Missing or unreadable cells** get the defaults of a new exercise: 3 sets of 10, 90 seconds' rest, and "Add weight" progression. A row with an exercise is always imported, whatever else it holds.
- **Exercises** are matched to yours and the built-in ones by name, exactly as for a plan file (see [Exercises](#exercises)).

If no sheet has a header LiftLog recognises, it says so and nothing is imported. Only the first 5,000 rows and 100 columns of a sheet are read, and a spreadsheet that unpacks to more than 20 MB is refused; copy just the routine into a new file if yours is bigger.

### Convert with AI

When no table is recognised, the message offers **Convert with AI**. That opens the AI planner on a new chat whose first message is the spreadsheet, and the planner replies with a plan you add with **Save new plan**, then edit like any other. Fixing the header and importing again still works.

The planner gets every sheet as CSV (empty rows dropped), with your locale and weight unit, and is asked for one routine per training day with the exercise names as written; what a plan can't hold, such as percentages or weights, goes into the exercise's notes. The CSV is cut at about 24 KB, at the end of a row, so it stays under the backend's 32 KB message limit; the planner is told when that happens. The text is built by `describeSpreadsheetForAi` in `app/src/services/plan-import/`.

The authoritative definition of the format is the JSON Schema at [`docs/schemas/program-blueprint/ProgramBlueprint.json`](./schemas/program-blueprint/ProgramBlueprint.json). It is generated from the app's own models, so it is always in step with what the app will accept.

## Generating a plan with Claude

This repository ships a Claude skill that writes plan files for you. Describe the training you want - "a 4-day upper/lower split for an intermediate lifter, dumbbells only" - and it produces a `.liftlogplan` file, validated against the schema above before you ever see it.

### Claude Code

```
/plugin marketplace add LiamMorrow/LiftLog
/plugin install liftlog-plan-builder@liftlog
```

### Claude chat (claude.ai)

Download [`create-liftlog-plan.zip`](https://github.com/LiamMorrow/LiftLog/releases/download/plan-builder-skill/create-liftlog-plan.zip), then in Claude go to `Customize -> Skills -> + -> Upload a skill` and select it.

That zip is rebuilt whenever the skill is released, so it always matches the newest released format rather than whatever is on `main`.

Once it is installed, just ask for what you want:

> Build me a 5x5 strength program, three days a week.

Get the resulting file onto your phone (AirDrop, email, or save it to Files) and tap it.

### Changing a plan you already run

The skill reads plans as happily as it writes them, so you can send it the one you are training on rather than describing it. Export the plan from `Plans -> ⋮ -> Export to file`, save it somewhere you can get at it from your computer (Drive, or mail it to yourself), then give the `.liftlogplan` to Claude and say what you want changed:

> Here's my current plan. Swap all the barbell work for dumbbells, and add a fourth day.

> This plan is taking too long. Cut it to 45 minutes without losing the compounds.

> Have a look at my plan and tell me what's missing.

Exporting means Claude sees your real exercise names, rest times, and progressive overload settings, so what comes back is your plan with the change made - not an approximation of it rebuilt from a description.

Importing the result **adds a new plan**; it does not overwrite the original. Delete the old one from `Plans` once the replacement is in. Your logged workout history is kept separately and is untouched by either.

## Generating a plan with another AI

Nothing about the format is Claude-specific. To use ChatGPT, Gemini, or anything else, give it the schema and the rules below:

> Write me a LiftLog workout plan as a single JSON object matching the schema at
> https://github.com/LiamMorrow/LiftLog/blob/main/docs/schemas/program-blueprint/ProgramBlueprint.json
>
> Rules that are easy to get wrong:
>
> - Treat every field in the schema as required, apart from the handful marked optional. Empty strings for `notes` and `link`.
> - `"version": 3` on the root object, `"version": 10` on every session.
> - Weights, distances and progression steps are decimal **strings**: `"2.5"`, not `2.5`. Rep counts are plain integers.
> - Rests and cardio times are ISO-8601 durations: `"PT3M"`, `"PT90S"`.
> - A weighted exercise has no set count: one entry in `plannedSets` is one set, and each has a `kind` (`"working"` for a plain set). Cardio uses `sets`, an array of set objects.
> - Supersets are a flag on the preceding exercise: `"supersetWithNext": true`.
> - `type` values are case-sensitive. Exercise types are PascalCase (`"WeightedExerciseBlueprint"`); cardio targets, progression scopes and resistance are lowercase or camelCase (`"time"`, `"allSets"`, `"bodyweight"`).
>
> [describe the training you want here]

Save the result as `My Plan.liftlogplan`.

## The format

A plan file is one JSON object: a name, a date, and a list of sessions. Each session is a training day holding a list of exercises.

```json
{
  "version": 3,
  "name": "Push Pull Legs",
  "lastEdited": "2026-07-12",
  "sessions": [
    {
      "version": 10,
      "name": "Push",
      "notes": "Chest, shoulders and triceps.",
      "exercises": [
        {
          "type": "WeightedExerciseBlueprint",
          "name": "Barbell Bench Press",
          "plannedSets": [
            { "reps": { "min": 5, "max": 5 }, "kind": "working" },
            { "reps": { "min": 5, "max": 5 }, "kind": "working" },
            { "reps": { "min": 5, "max": 5 }, "kind": "working" }
          ],
          "restBetweenSets": { "minRest": "PT3M", "maxRest": "PT5M", "failureRest": "PT5M" },
          "supersetWithNext": false,
          "notes": "",
          "link": "",
          "resistance": "external",
          "progression": [
            {
              "axis": "load",
              "step": "2.5",
              "scope": { "type": "allSets" },
              "trigger": "allSetsMetTarget"
            }
          ],
          "warmupSets": [
            { "load": { "type": "absolute", "weight": { "unit": "kilograms", "value": "20" } }, "reps": 8 },
            { "load": { "type": "percent", "percent": 50 }, "reps": 5 },
            { "load": { "type": "percent", "percent": 70 }, "reps": 3 }
          ]
        }
      ]
    }
  ]
}
```

Complete examples live in [`plugins/liftlog-plan-builder/skills/create-liftlog-plan/examples/`](../plugins/liftlog-plan-builder/skills/create-liftlog-plan/examples) - one weighted plan and one cardio plan.

### Exercises

An exercise is either a `WeightedExerciseBlueprint` or a `CardioExerciseBlueprint`, chosen by its `type`. The two can be mixed within a session.

`exerciseId` is optional, and a hand-written plan should leave it out. On import the app links each exercise by its `name`: to one of the user's own exercises with that name, otherwise to a built-in (by its English name, its name in any language, or the name the user renamed it to), and only when nothing matches does it add a new exercise. That is what keeps the plan's history joined to the user's existing history, and lets them rename the exercise later without losing it. A plan exported from the app carries the ids; an id the importing device doesn't know - a friend's own exercise, say - is linked by name the same way.

**Weighted exercises** have a list of planned sets, rest times, a resistance, and a list of progression rules. `plannedSets` holds one entry per set, each with that set's rep target as a `min`/`max` band - `min === max` is a plain "five reps" - and its `kind`, which says what the set is for (see [Set kinds](#set-kinds)). `restBetweenSets` needs all three of `minRest`, `maxRest`, and `failureRest` (the last being the rest taken after missing a rep target). `link` is a URL explaining the movement, and should stay `""` unless you have a real one.

#### Set kinds

| `kind`      | What it is                                  | Volume | Records | Progression check | Carries over |
| ----------- | ------------------------------------------- | ------ | ------- | ----------------- | ------------ |
| `"working"` | A plain set                                 | yes    | yes     | yes               | yes          |
| `"failure"` | A set taken to failure                      | yes    | yes     | yes               | yes          |
| `"drop"`    | A drop set: lighter, straight after another | yes    | no      | no                | no           |
| `"myo"`     | A myo-rep set                               | yes    | no      | no                | no           |

A set that is not part of the progression check never holds a progression back, and the rules never
move it. One that does not carry over starts each session on the plan's reps. It keeps its own weight
from last time as a starting point, since a drop set is usually the same drop each week, but only when that
slot was the same kind last time. It never takes a working set's weight, and a working set never takes its: a working set that was a drop
or myo set last time starts over at no weight and the plan's reps, and the rules leave it there for that
session. In the app only working sets are numbered; the others show D, M or F. Warm-ups are not a
`kind` - they are planned in `warmupSets` - and show W.

`resistance` says where the load comes from: `external` for barbells, dumbbells and machines (the logged weight is the weight lifted), `bodyweight` for pull ups and dips (the logged weight is what is added on top of the lifter), or `none` for movements like crunches, where there is no weight at all and reps are the whole story.

`warmupSets` lists the warm-ups done before the working sets, in order, and is `[]` for none. Warm-ups never count toward progression, records or stats. Each has fixed `reps` and an optional `load`:

- `{ "type": "percent", "percent": 50 }` is a share of the session's heaviest working set (out of 100), rounded to the exercise's load step. It is only for `external` resistance.
- `{ "type": "absolute", "weight": { "unit": "kilograms", "value": "20" } }` is a fixed weight, such as an empty bar. It is the one weight in a plan that carries a unit. A plan written in pounds keeps its pounds when imported, and a lifter who uses kilos gets the weight converted and rounded when the workout starts. On a `bodyweight` exercise it is the added weight.
- With no `load`, the warm-up is reps only. That's the only kind an exercise with `none` resistance can have.

`supersetWithNext` is how supersets are expressed: there is no superset group. Setting it to `true` means "perform this back-to-back with the next exercise in the list, without resting".

**Cardio exercises** have no resistance and no progression. Their `sets` is an array - one entry per interval - and each entry has a `target` (either a time or a distance) plus six `track*` booleans controlling which fields the app shows you while logging, and optionally its own `restBetweenSets`.

### Progression

`progression` is an ordered list of rules. After a session where every set met its target, the first rule that still has room to move is applied - and only that one. An empty list means the exercise never moves on its own.

| Field       | Effect                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `axis`      | What the rule moves: `load` or `reps`.                                                                                              |
| `step`      | How much to add, as a decimal string. Unitless - `"2.5"` is the same pair of small plates in a kilo gym and a pound gym.            |
| `scope`     | `{ "type": "allSets" }`, or `{ "type": "lowestSets", "pick": … }` with `first`, `middle`, `last` or `all` to raise only the lowest. |
| `trigger`   | Always `allSetsMetTarget`.                                                                                                          |
| `ceiling`   | Optional, reps only. Where the rule stops, handing over to the next one.                                                            |
| `onCeiling` | Optional, reps only. `reset` drops the reps back to the plan's when a later rule takes over.                                        |

Only a reps rule takes a ceiling, so a load rule never runs out of room and must come last - anything after it can never fire. Reps to a ceiling followed by weight is double progression: the reps climb, then the weight goes up and the reps start again.

See [Progression](./Progression.md) for how the rules behave in the app.

## Validating a plan

The skill ships a validator, and you can run it directly on any file. It needs no dependencies and no network:

```bash
node plugins/liftlog-plan-builder/skills/create-liftlog-plan/scripts/validate-plan.mjs "My Plan.liftlogplan"
```

It lists every problem at once, with the path to the offending field:

```
My Plan.liftlogplan is not a valid LiftLog plan:

  plan/sessions/0/exercises/0/restBetweenSets/minRest must match format "duration"
  plan/sessions/1/exercises/0/progression/0/step must be string
```

This is worth doing, because when a field is wrong the app will only tell you _"That file isn't a valid workout plan"_ - it cannot tell you which one.

## Regenerating the schema

Both the schema and the validator are generated from `app/src/models/storage/versions/latest/blueprint.ts`. After changing that model:

```bash
cd app && npm run json-schema
```

This rewrites the published schema, the copy bundled into the app, the copy inside the skill, and the skill's validator. CI checks the committed copies still match the models on every branch, so all four move together on `main`. Users only see the change once the `plan-builder-skill` tag advances, which `scripts/release-plan-builder-skill.ts` does - run by hand once the release is live in the stores, not when it is uploaded to them.

See [Storage Migrations](./Migrations.md) for the full process of changing a stored model.
