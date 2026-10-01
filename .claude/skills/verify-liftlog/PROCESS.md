# How a change is verified

The order an agent (or a workflow of agents) follows to take an `app/` change from code to a proven PR. The
emulator is the slowest and scarcest step, so it runs once, at the end, on code that review has already cleared.
`SKILL.md` covers the `verify.sh` commands; this file covers when to use them. The saved workflow
`.claude/workflows/liftlog-lanes.js` runs this order for a list of lanes.

## The order

1. **Build.** Write the change with its unit tests. Push and open the PR ready, not draft.
2. **Gates and review, in parallel.** Gates: from `app/`, `npx vitest run`, `npm run typecheck`, `npm run lint`,
   `npm run format:check`. Review: a read-only code review of the diff against the spec and `AGENTS.md`.
3. **Fix until the review is clean.** The owner fixes what gates and review found, then both run again on the new
   head. Stop after 3 rounds and report what is still open.
4. **The emulator, once.** One live proof of every scenario at the reviewed head.
5. **Only an emulator failure goes back.** Fix it, review that fix (gates and review of the new commits only), then
   re-run only the scenarios that failed. Stop after 2 rounds.

Never run a code review after the emulator. Review findings that arrive after a live run cost another emulator
trip each, which is what this order exists to avoid. A fix for an emulator failure gets its own review before the
re-run, never after.

## What blocks

- Blocks: a failed scenario, a failing gate, or a real defect (wrong behaviour, data loss, a broken rule in
  `AGENTS.md`). These go back to the owner.
- Does not block: questions, observations, product calls and nits. They go to the PR's `## Open decisions` and
  never start a new round.

A scenario that could not run is `NOT RUN` with the reason, never `PASS`. It is not a failure either: list it
in the PR's `## Verification` and leave it for the user.

## Slots

`verify.sh up` claims a free slot: its own AVD, emulator port and Metro port. Two lanes can be live at once, one
per slot. `verify.sh doctor` prints the slot you hold.

- Never stop an emulator or Metro that another checkout started, even if it blocks you. Wait for a slot instead,
  or ask the user.
- Never touch `emulator-5554`, Metro 8081 or the `Pixel_10_Pro_XL` AVD. They are the user's.
- Always finish with `verify.sh down` from your own checkout, after a failure too, so the slot frees up.

## Preconditions vs proof

- **Preconditions come from a fixture.** Seed the data a scenario needs (plans, history) with
  `verify.sh seed <fixture>` instead of tapping it in. A fixture is a starting state, not proof of anything.
- **The feature under test goes through the real UI.** Tap through it as a user would. No deep links that skip
  the screens under test, no writes to SQLite or Redux.
- **Side effects are checked with `verify.sh db`**, before and after, or by reopening the screen.

## Replayable flows

Save each live scenario as a Maestro flow: under the run's evidence directory, or in `app/.maestro/` when it is
worth keeping as an e2e flow. Name it for the scenario. A re-test replays the saved flows with
`verify.sh flow <file>` rather than re-driving the app by hand. Edit a saved flow only where the fix changed
what the user sees.

## Screenshots on UI PRs

The rule in `AGENTS.md` ("Screenshots on UI pull requests") applies: before (`main`) and after with the same data,
light and dark, downscaled, committed to `pr-assets` under the issue's folder, and embedded with
`raw.githubusercontent.com` URLs pinned to the `pr-assets` commit SHA. A re-test keeps the before shots already in
the PR and adds only new after shots for the scenarios it re-ran.

## Parallel lanes

- Give lanes disjoint files. Name each lane's boundary in its spec, and list what it must not touch.
- A lane that moves or adds routes stacks on the lane that changes the tab structure (it branches from that
  lane's branch and starts when it finishes) rather than running beside it. In phase 3, PM-24 changed the tabs
  while PM-26 moved routes beside it, and that seam cost four extra rounds.
- Lanes share the two emulator slots, so at most two are live at a time. The rest wait for a slot, not for each
  other's reviews.
