# Progression - how your numbers move week to week

When an exercise is completed, the next time it is loaded into a workout, two things happen:

- **Carry over** always happens. Starting a workout opens each exercise on the numbers you did last
  time, not the numbers written in your plan.
- **Progressive overload** is a list of rules on the exercise that pushes those numbers up when you hit
  your targets.

## Carry over

When you start a workout, LiftLog looks for the last time you did the same exercise and loads those
numbers in.

- It matches on the **exercise itself**, and nothing else: not how many sets it had, and not its rep
  scheme. The exercise is the one in your exercise list, not its name, so renaming it there keeps your
  numbers, and so does spelling it differently in a plan ("Squat", "squat" and "Squats" are the same
  exercise). Adding or removing a set, mid-workout or in the routine, keeps your progress. Swapping in a
  different exercise starts over from the plan.
- **Your routine decides how many sets you get.** Last time's numbers are fitted onto today's sets, so a
  set you added once and did not keep in the routine is not carried as an extra set.
- **Weight always carries over, from your best set.** The best set is your heaviest working or failure
  set. On a tie on weight, the one with more reps wins. It does not matter whether that was your first,
  middle or last set, or whether you did it once or on every set: if you did 35 kg, you open on 35 kg.
- **Straight sets all open on the best weight.** When your sets differ on purpose (a pyramid, or a top
  set with back-off sets), the heaviest set opens on the best weight and every other set keeps its gap
  below it. Last time's sets are matched to today's in order. So 60, 70, 80 and an extra top set of 85
  opens next time as 65, 75, 85; and 100, 80, 80 stays 100, 80, 80. A set with nothing to match (you
  added one to the routine) opens on the best weight.
- **Reps you completed last time normally do not.** The target comes back from the plan each session.
- A workout you opened but never logged a set in is ignored, so an abandoned session cannot become the
  number you are stuck chasing. Logging only the warm-ups counts as not logging a set.
- **Warm-up, drop and myo sets are never the best set**, however heavy. Warm-ups are rebuilt from the
  plan each session rather than carried, and the rules ignore them: a skipped or short warm-up never
  fails a session, and a light one is never picked as the "lowest set". A drop or myo set opens on the
  weight of the same drop or myo set last time, and the rules never move it.
- **One exercise is one lineage.** If a routine has the same exercise twice, or you run it heavy one day
  and light another, the next session carries from whichever you did last.

**Reps carry over too when reps are what you are progressing on** - either the exercise's Resistance is
set to None (there is nothing else to advance on), or you have given it a rule that increases reps. In
that case the plan's reps are just the first rung of a ladder, so LiftLog keeps whatever the rule has
won for you and stops re-reading the plan. Changing the plan's starting reps then will not throw away
progress you have already made.

Why reps behave differently by default: the only way to change a rep target is to edit the plan. A rep
target changed in the middle of a workout is for that workout only: the "Update your routine?" sheet you
see when you finish lists structural changes (exercises, set counts, set types, warm-ups, rest,
supersets, order) and leaves weights and reps to progression. To change a routine's reps for good, edit
the routine.

## Progressive overload

Found under **Progressive Overload** in the exercise editor. A new exercise has no rules, so it stays
where you leave it until you add one.

**Rules only fire after a successful session**, and what counts as successful depends on the rule:

- A **weight rule** needs your **best set** logged at or above its target. The other sets do not have to
  make it. A heavier set that fell short holds the weight, even when a lighter one hit its reps.
- A **reps rule** needs **every set** logged, each at or above its target, because the reps climb on
  every set together.

Miss it and nothing moves; you repeat the same numbers next time.

**Rules run in order, and only one runs per session.** LiftLog takes the first rule that still has room
to move and stops there. This is what lets you chain them. If that rule's session was not successful,
nothing moves: a weight rule behind a reps rule that is still climbing waits for the reps.

Each rule has:

- **Increase** - Reps or Weight.
- **Reps to add** / **Amount to increase** - how much. For weight this is in whatever unit you lift in,
  so 2.5 is a pair of small plates in a kilo gym and in a pound gym alike.
- **Apply to** - every set, or just the lowest ones (all of them, or only the first, middle or last).
  "Lowest" means lowest on whatever that rule increases: a reps rule picks your smallest target, not
  your lightest set.
- **Stop at a limit** (reps only) - the rule stops once reps reach the limit, and the next rule takes
  over.
- **Start over after** (reps only) - when the next rule takes over, drop reps back to what the plan
  asks for.

**Rep ranges move as a block.** A target of 8-12 with "add 1 rep" becomes 9-13. If a limit is in the
way, both ends still move by the same amount, so the range keeps its width instead of squashing shut.

**A rule with no limit never stops**, so nothing after it can ever run. Weight rules have no limit at
all, so a weight rule always has to be last. The editor dims any rule that can never run and tells you
how to fix it, and **Add rule** arranges new rules so this does not happen - adding a rule to a
weight-only exercise puts the new reps rung _in front_ of the weight rule, not behind it.

Tap **Example** to see four sessions of your actual exercise played out under the rules you have set.

## Double progression

Climbing reps to a limit, then adding weight and starting the reps again. There are two ways to set it
up, and you want one or the other, not both.

- **A rep range** like 8-12 with a weight rule. A set only counts as successful at the top of the range,
  so the weight only goes up once your best set hits 12. The counter shows "8-12" every week.
- **A fixed rep target** like 8, with two rules: `Reps +1, stop at a limit of 12, start over after`, then
  `Weight +2.5`. The counter shows the rung you are actually on - 8, 9, 10, 11, 12 - then the weight goes
  up and the reps drop back to 8.

If you set a rep range _and_ a reps rule whose limit is the top of that range, the reps rule can never
move and does nothing at all.

---

For the code behind this: `progressionKey()`, `applyProgression`, `applyEarnedProgression` and
`ProgressionRule.isEarnedBy` in `app/src/models/blueprint-models/index.ts`; the best set
(`bestSetIndex`, `bestSetMetTarget`) and fitting last time onto today's sets
(`RecordedWeightedExercise.carriedInto`) in `app/src/models/session-models/recorded-weighted-exercise.ts`;
what each set kind carries in `app/src/models/session-models/set-kind.ts`; session start in
`app/src/services/session-service.ts`; the editor in
`app/src/components/presentation/workout-editor/progressive-overload.tsx`. The stored
`workout_exercise.progression_key` column was rewritten to the new key by the
`REKEY_PROGRESSION_BY_EXERCISE` data migration (`app/src/services/data-migrations/rekey-progression.ts`).
