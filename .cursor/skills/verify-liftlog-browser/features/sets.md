# Add a workout set

Add another working set through the workout table. The new row remains when the page reloads.

## Sub-features

- `sets.add`: Add one working set through the table's Add set control.
- `sets.reload`: Retain the added row and its log control after a browser reload.

## How to get to it (user POV)

Open the instance URL printed by `up`. In **Browser verification**, find **Add set** below the
**Barbell Bench Press** set rows. This is the prototype's entry point for adding a set.

## Driving it with Playwright

Preconditions: Start a fresh run with two unlogged working sets and **Workout saved**.

```bash
npm run verify:browser -- sets
```

The command runs these checks at both sizes on separate fresh fixtures. `app` is the driver's
`page.frameLocator('iframe[title="Workout preview"]')` locator. The driver performs these actions and
checks their results:

- Add: `app.getByRole('button', { name: 'Add set', exact: true }).click()` adds one row. The driver waits
  for `Workout saved` before reloading.
- Reload: `page.reload()` retains the row. `after-add-set.db.json` has one more `weightedSets` row than
  `before-add-set.db.json`, and button `Log Set 3` is visible. The `added-set` screenshot and ARIA snapshot
  show the third set.

## Gotchas

- A manual drive reuses the current database. It may add Set 4 or later if a previous scenario added rows.
  The driver checks the count relative to its SQL snapshot.
- The `all` scenario runs this check after workout and theme checks. The standalone `sets` command uses a
  fresh fixture.
- This recipe verifies count and persistence. It does not assert carried weight, reps, set type, deletion,
  or the native finish-workout offer to update a routine.
