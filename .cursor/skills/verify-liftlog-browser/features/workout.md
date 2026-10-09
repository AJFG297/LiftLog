# Log and undo a workout set

Enter weight and reps on the workout's number pad, log the set, and undo it. Logged values remain after
a browser reload and a server restart using the same database.

## Sub-features

- `workout.weight`: Enter 82.5 kg through the number pad's decimal key.
- `workout.reps`: Enter 7 reps and log the set through the pad's primary action.
- `workout.reload`: Reopen the page and retain the logged values and undo control.
- `workout.restart`: Restart the server and retain the stored logged set.
- `workout.undo`: Undo the set, reload, and retain its weight while clearing completion and recorded reps.

## How to get to it (user POV)

Open the instance URL printed by `up`. The prototype opens directly into **Browser verification**.
Select Set 1's weight or reps field to open the number pad. The pad's **Log set** button logs the set;
the row then offers **Undo Set 1**. The row's **Log Set 1** control is also visible, but its one-tap
logging path is not exercised by this scenario.

## Driving it with Playwright

Preconditions: Start a fresh run with two unlogged working sets and **Workout saved**.

```bash
npm run verify:browser -- workout
```

The command runs these checks at both sizes on separate fresh fixtures. `app` is the driver's
`page.frameLocator('iframe[title="Workout preview"]')` locator. The driver performs these actions and
checks their results:

- Weight: `app.getByRole('button', { name: /^Weight for Set 1:/ }).click()` opens the pad. Buttons `8`,
  `2`, `Decimal point`, and `5` produce 82.5. The `weight-input` screenshot and ARIA snapshot show the entry.
- Reps: Button `Hide keypad` keeps the weight. Button matching `/^Reps for Set 1:/` opens reps, and button
  `7` enters them. The `reps-input` artifacts show the entry before logging.
- Log: Button `Log set` changes the row to `Undo Set 1`. `logged.db.json` has `reps: 7`,
  `weight_value: "82.5"`, `weight_unit: "kilograms"`, and a non-null `completed_at`.
- Reload: `page.reload()` retains the 82.5 kg weight, 7 reps, and `Undo Set 1`. The `reloaded` artifacts
  show those controls after the page loads again.
- Restart: The controller restarts this run's server, and `page.goto(state.url + "/?viewport=" + preset.id)` opens its returned URL at the selected size.
  `server-restarted.db.json` retains 82.5 and 7; the `server-restarted` artifacts show the undo control.
- Undo: Button `Undo Set 1` followed by `page.reload()` restores `Log Set 1`. `undone.db.json` has
  `reps: null`, `completed_at: null`, and `weight_value: "82.5"`. The `undone` artifacts show the row.

## Gotchas

- The scenario expects exactly two starting sets. Use a fresh run after adding a set.
- Entered reps are drafts until logging. Check persisted `reps` after logging rather than after typing.
- Button `Log set` belongs to the pad. Button `Log Set 1` belongs to the row. Keep their exact names distinct.
- A restart may change the port. The driver follows the new URL while retaining the same database.
- RPE, set type changes, deletion, and the native live-workout navigation are outside this recipe.
