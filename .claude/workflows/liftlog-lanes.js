export const meta = {
  name: 'liftlog-lanes',
  description: 'Build LiftLog lanes in parallel worktrees, gates and code review until clean, then one live proof per lane on the emulator slots; only live failures go back for a fix, a review of it and a re-run of the failed scenarios',
  whenToUse: 'Running one or more app/ changes (lanes) from spec to a reviewed, live-proven PR in the order in .claude/skills/verify-liftlog/PROCESS.md. Pass args.lanes: [{ id, branch, base, title, spec, live, folder, effort, fixture }], and optionally args.slots (default 2).',
  phases: [
    { title: 'Build', detail: 'one owner per lane in its own worktree; the PR is opened ready' },
    { title: 'Review', detail: 'gates and a code review in parallel; the owner fixes until clean, at most 3 rounds' },
    { title: 'Live', detail: 'one live proof per lane, as many at once as there are emulator slots' },
    { title: 'Fix', detail: 'owner fixes review findings, or live failures (then review, then re-run only those)' },
  ],
}

// Lane fields (all strings unless noted):
//   id        issue id, e.g. 'PM-38'
//   branch    branch to create
//   base      branch to start from and open the PR against (default 'main'); naming another lane's branch
//             stacks this lane on it, so it starts when that lane finishes
//   title     PR title subject
//   spec      what to build, its boundary and what not to touch, its acceptance
//   live      live scenarios, one per line; empty means no live proof (non-UI lanes)
//   folder    pr-assets folder for screenshots (default the id in lower case)
//   effort    owner effort: 'medium' (default) or 'high' for hard lanes
//   fixture   optional fixture for verify.sh seed: 'ppl-history' (programs and two weeks of history), 'empty'
//             (onboarded, no history), or another listed by verify.sh fixtures
//   ui        optional boolean, default true: false skips before/after screenshots
const REPO = (args && args.repo) || '/Users/aidanbuzzaroo/Documents/Personal/repos/LiftLog'
const SLOTS = (args && args.slots) || 2
const MAX_REVIEW_ROUNDS = (args && args.maxReviewRounds) || 3
const MAX_LIVE_ROUNDS = (args && args.maxLiveRounds) || 2
// Live time on code review has not cleared is what PROCESS.md exists to avoid, so it is opt-in.
const LIVE_DESPITE_OPEN_REVIEW = !!(args && args.liveDespiteOpenReview)
const OPUS = 'opus'

const LANES = ((args && args.lanes) || []).map((l) => ({
  ...l,
  base: l.base || 'main',
  folder: l.folder || String(l.id).toLowerCase(),
  effort: l.effort || 'medium',
  ui: l.ui !== false,
  live: (l.live || '').trim(),
}))
if (!LANES.length) throw new Error('liftlog-lanes: pass args.lanes, a list of { id, branch, base, title, spec, live, folder, effort }')
for (const l of LANES) {
  for (const k of ['id', 'branch', 'title', 'spec']) {
    if (!l[k]) throw new Error(`liftlog-lanes: lane ${l.id || '?'} is missing ${k}`)
  }
}
const byBranch = {}
for (const l of LANES) byBranch[l.branch] = l
for (const l of LANES) {
  const seen = new Set([l.id])
  for (let p = byBranch[l.base]; p; p = byBranch[p.base]) {
    if (seen.has(p.id)) throw new Error(`liftlog-lanes: lanes ${[...seen].join(', ')} stack on each other in a cycle`)
    seen.add(p.id)
  }
}

const others = (l) => LANES.filter((o) => o.id !== l.id).map((o) => `${o.id} (${o.title}, branch ${o.branch})`).join('; ') || 'none'

const COMMON = (l) => `Repo ${REPO}. You work on lane ${l.id}: ${l.title}. Follow .claude/skills/verify-liftlog/PROCESS.md (the verification order) and AGENTS.md. No long dashes in any prose you write. Comments only for a non-obvious why. Never merge a PR, never push to main, never force-push. Commits use Conventional Commits and end with the line: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Checks, from app/: npx vitest run, npm run typecheck, npm run lint, npm run format. A vitest timeout under heavy load is flaky; rerun once before chasing it. Typecheck errors about typed routes that do exist are stale generated types. Other lanes run at the same time in their own worktrees: ${others(l)}. Stay inside your lane's boundary.`

const FINDING = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['blocker', 'should-fix', 'nit'] },
    file: { type: 'string' },
    line: { type: 'integer' },
    summary: { type: 'string' },
    evidence: { type: 'string' },
  },
  required: ['severity', 'summary', 'evidence'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    findings: { type: 'array', description: 'real defects and rule breaks only', items: FINDING },
    notes: { type: 'array', description: 'questions, observations and product calls; these never block', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'notes'],
}
const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    worktree: { type: 'string', description: 'absolute path of the worktree root' },
    branch: { type: 'string' },
    headSha: { type: 'string' },
    prUrl: { type: 'string' },
    summary: { type: 'string' },
    gates: { type: 'string', description: 'exact outcome of vitest, typecheck, lint and format' },
    nativeChanges: { type: 'boolean', description: 'true if package.json native deps, app.json plugins, app/modules, app/plugins or any Kotlin or Java changed' },
    openDecisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['worktree', 'branch', 'headSha', 'prUrl', 'summary', 'gates', 'nativeChanges', 'openDecisions'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    headSha: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    dismissed: { type: 'array', items: { type: 'object', properties: { summary: { type: 'string' }, reason: { type: 'string' } }, required: ['summary', 'reason'] } },
    nativeChanges: { type: 'boolean' },
    gates: { type: 'string' },
  },
  required: ['headSha', 'fixed', 'dismissed', 'nativeChanges', 'gates'],
}
const APK_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, apkPath: { type: 'string' }, evidence: { type: 'string' } },
  required: ['ok', 'apkPath', 'evidence'],
}
const LIVE_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          result: { type: 'string', enum: ['PASS', 'FAIL', 'NOT RUN'] },
          evidence: { type: 'string' },
          flow: { type: 'string', description: 'absolute path of the saved Maestro flow that replays this scenario' },
        },
        required: ['name', 'result', 'evidence', 'flow'],
      },
    },
    runId: { type: 'string' },
    slot: { type: 'string', description: 'the slot verify.sh up claimed, as doctor reports it' },
    prAssetsSha: { type: 'string' },
    prBodyUpdated: { type: 'boolean' },
    problems: { type: 'array', description: 'real defects found live only', items: { type: 'string' } },
    notes: { type: 'array', description: 'questions and observations; these never block', items: { type: 'string' } },
  },
  required: ['scenarios', 'runId', 'slot', 'prAssetsSha', 'prBodyUpdated', 'problems', 'notes'],
}

// A small counting semaphore: one permit per emulator slot, so no more live agents run than verify.sh can seat.
function semaphore(n) {
  let free = n
  const waiting = []
  return {
    async acquire() {
      if (free > 0) { free--; return }
      await new Promise((resolve) => waiting.push(resolve))
    },
    release() {
      const next = waiting.shift()
      if (next) next()
      else free++
    },
  }
}
const slots = semaphore(SLOTS)
async function withSlot(fn) {
  await slots.acquire()
  try { return await fn() } finally { slots.release() }
}

function buildPrompt(l) {
  return `${COMMON(l)}

You own lane ${l.id}. Spec:
${l.spec}

Steps:
1. You are in a fresh worktree. Set it up: ln -s ${REPO}/app/node_modules app/node_modules; cp ${REPO}/app/expo-env.d.ts app/; mkdir -p app/.expo && cp -R ${REPO}/app/.expo/types app/.expo/ (skip what is missing). Then: git fetch origin && git switch -c ${l.branch} origin/${l.base}.
2. Read docs/index.md and the docs for the areas you touch. Name the data shape before code: which state, selectors and models you reuse and what is new.
3. Build it in small commits that each pass the checks. Add unit tests for new pure logic that assert literal values through the public functions. Update the docs that describe what you changed, and docs/index.md if you add a doc.
4. Run all checks until green. Do NOT run the emulator or verify.sh; a later stage runs the live proof once, after review.
5. Push with git push -u origin ${l.branch} and open the PR ready (not draft): gh pr create --base ${l.base} --title "<type(scope): ${l.title}>" with a body in these sections: ## Why, ## Scope (real symbols and paths), ## Tradeoffs (only real choices), ## Open decisions (each product call you made), ## Blast Radius, ## Verification (gate results, then "Live proof follows after review."). Mention ${l.id}${l.base !== 'main' ? ` and that it is stacked on ${l.base}` : ''}. End the body with: 🤖 Generated with [Claude Code](https://claude.com/claude-code)
Do not block on product questions: pick the option that best serves two people logging workouts on their phones and list it under Open decisions. Return the structured result.`
}

function gatesPrompt(l, b, head) {
  return `Read-only gates for ${l.id} (${b.prUrl}) at ${head} in the worktree ${b.worktree}. Do not edit, commit or push. Confirm git rev-parse HEAD starts with ${head}. From app/: npx vitest run, npm run typecheck, npm run lint, npm run format:check. A vitest timeout under heavy load is flaky; rerun once. Typed-route errors for routes that exist are stale generated types; confirm the route file exists before dismissing one. Grep git diff origin/${l.base}...HEAD for toSorted/toSpliced/toReversed, useMemo/useCallback/React.memo added without a stated need, new react-native-paper imports, hard-coded colours in components, and default exports in new non-route files. A failing gate or rule break is a blocker with the exact output as evidence. FAIL on any blocker.`
}

function reviewPrompt(l, b, from, head, focus) {
  return `Read-only code review for ${l.id} (${b.prUrl}) at ${head} in the worktree ${b.worktree}. Do not edit, commit or push. Judge the code, not the PR body or the owner's summary.
Review git diff ${from}...${head}, reading the surrounding code as needed. Spec:
${l.spec}
${focus ? `These commits were meant to fix the following; check each is fixed at its root cause and nothing regressed:\n${focus}\n` : ''}Check: each spec point and acceptance criterion is met; correctness (state, stale closures, navigation and back behaviour, off-by-one, data loss on persisted models, compatibility between this fork's app versions per ADR-0001); tests assert real behaviour with literal values; conventions (theme tokens, foundation components, native system chrome, accessibility labels and 44pt targets, comments only for a non-obvious why); files outside the lane's boundary.
Findings are real defects only, each with file, line and evidence. A missing or wrong behaviour is a blocker. Questions, observations and product calls go in notes, never in findings. PASS only with no blockers and no should-fixes.`
}

function fixPrompt(l, b, head, why, items) {
  return `${COMMON(l)}

You own ${l.id} (${b.prUrl}). Work only in the worktree ${b.worktree} on branch ${l.branch}. Confirm git rev-parse HEAD starts with ${head} first.
${why}
${items}
Fix each blocker and should-fix at its root cause. Assess each on its merits and dismiss one only with a concrete reason. Fix a nit only if it is trivial. Add or update unit tests that assert literal values. Small commits, all checks green, then git push origin ${l.branch}. Keep the PR body's ## Scope and ## Open decisions accurate (gh pr edit --body-file). Do NOT run the emulator or verify.sh. Return the structured result.`
}

function apkPrompt(l, b, head) {
  return `${COMMON(l)}

Build the debug APK for ${l.id} in the worktree ${b.worktree} at ${head}; the diff changes native code. Run .claude/skills/verify-liftlog/verify.sh build there (delete that worktree's app/android first if app.json plugins changed). Do not start an emulator. Never run gradlew --stop. Return ok, the APK path and the tail of the build output as evidence.`
}

function apkLine(apkPath) {
  return apkPath
    ? `APK: use the one built for this branch at ${apkPath}.`
    : `APK: the diff has no native changes, so copy ${REPO}/app/android/app/build/outputs/apk/debugOptimized/app-debugOptimized.apk to the same relative path in the worktree (mkdir -p first) instead of building.`
}

const LIVE_RULES = (l) => `Read .claude/skills/verify-liftlog/SKILL.md in the worktree and use only verify.sh. Prefix every verify.sh call with VERIFY_SLOTS=${SLOTS}, so verify.sh seats as many live agents as this workflow runs at once. Start with verify.sh up (redirect its output to a file; never pipe it): it claims a free emulator slot, and doctor reports which one. If no slot is free, check verify.sh slots, then wait and retry; never stop an emulator or Metro another checkout started, never run down from another checkout, and never touch emulator-5554, Metro 8081 or the Pixel_10_Pro_XL AVD. Never run gradlew --stop, pkill node or adb kill-server. Then get to Home with verify.sh seed <fixture>, which ends with flows/ready.yaml, or with verify.sh flow .claude/skills/verify-liftlog/flows/ready.yaml when no data is needed. If the dev client shows the Expo launcher instead of LiftLog, re-run verify.sh up, which reopens Metro on the slot you hold. Metro may miss edits in a worktree, so after any git checkout that changes code run verify.sh down then verify.sh up, and seed again, before trusting the app.
Preconditions come from a fixture, proof from the real UI: seed the data a scenario needs (verify.sh fixtures lists them; verify.sh clear gives a first run; verify.sh snapshot <name> saves a slow-to-reach state so seed <name> returns to it), then tap through the feature under test as a user would, with no deep links that skip the screens under test and no writes to SQLite. Check every side effect with verify.sh db before and after, or by reopening the screen. Reuse the helpers in .claude/skills/verify-liftlog/flows/seed/ in your flows.
Save each scenario as its own Maestro flow in .verify-runs/scenarios/${l.folder}/ at the worktree root, numbered in run order (<nn>-<scenario>.yaml), naming its fixture in its first comment, with takeScreenshot after the key tap and on the result screen. Run them with verify.sh flows <file>, so a re-test can replay them unchanged. Report each flow's absolute path.
A scenario you could not run is NOT RUN with the reason, never PASS. If a tool call is denied, do not try another route to the same action; mark the scenario NOT RUN and say what was denied. Do not fix code. Put only real defects in problems; questions and observations go in notes.
Finish with verify.sh down from this worktree, always, after a failure too.`

function screenshotsLine(l, suffix) {
  if (!l.ui) return 'This lane changes nothing users see, so take no PR screenshots; keep the evidence on disk.'
  return `Screenshots: downscale them (sips -Z 800), add them to the pr-assets branch under ${l.folder}/${suffix ? ` with the suffix ${suffix}` : ''} from a temporary worktree (git worktree add /tmp/pr-assets-${l.folder} origin/pr-assets; fetch and rebase before you push, since other lanes push there too; never force-push; remove the temporary worktree after). Embed them in the PR body with <img src="https://raw.githubusercontent.com/AJFG297/LiftLog/<pr-assets commit SHA>/${l.folder}/<file>.png" width="200"> in before and after tables, light and dark.`
}

function livePrompt(l, b, head, apkPath) {
  return `${COMMON(l)}

You run the one live proof for ${l.id} (${b.prUrl}) at ${head}, which code review has already cleared. Work only in the worktree ${b.worktree}.
${apkLine(apkPath)}
${LIVE_RULES(l)}
${l.fixture ? `Seed the preconditions with verify.sh seed ${l.fixture} in place of ready.yaml, and again after each restart. If the base and the branch differ in storage code, the base's seed rebuilds the fixture from its seed flow first; let it.` : 'No fixture is named for this lane: pick the nearest one from verify.sh fixtures (seed empty for an onboarded app with no data), add only what the scenarios still need through the UI, and say how in each scenario\'s evidence.'}
${l.ui ? `Before shots: git checkout --detach origin/${l.base}, restart, confirm the old UI shows, and take them with the same seeded data. Then git checkout ${l.branch}, restart, confirm HEAD is ${head} and the new UI shows, and run the scenarios.` : `Stay on ${l.branch} at ${head}.`}
Scenarios:
${l.live}
${screenshotsLine(l, '')}
Update the PR body with gh pr edit --body-file: replace "Live proof follows after review." under ## Verification with each scenario's result, and add your own notes under ## Open decisions, keeping what is already there. Return the structured result.`
}

function retestPrompt(l, b, head, apkPath, failed, prevHead) {
  return `${COMMON(l)}

RE-TEST for ${l.id} (${b.prUrl}) at ${head}. The fix for the failures below was reviewed after ${prevHead}. Work only in the worktree ${b.worktree}, on ${l.branch} at ${head}; do not check out the base and do not retake before shots.
${apkLine(apkPath)}
${LIVE_RULES(l)}
${l.fixture ? `Seed with verify.sh seed ${l.fixture} in place of ready.yaml, the same fixture the first run used.` : 'Seed from the same fixture each flow names in its first comment.'}
Re-run only these scenarios, by replaying their saved flows with verify.sh flows <file>..., seeding again before a flow whose starting state an earlier one changed. Edit a flow only where the fix changed what the user sees, and say what you changed:
${failed.map((s) => `- ${s.name} (flow: ${s.flow || 'none saved; write one'}). Last time: ${s.evidence}`).join('\n')}
Return only these scenarios.
${screenshotsLine(l, `-r${prevHead.slice(0, 7)}`)} Replace only the after images for these scenarios and keep the before images already in the PR. Update ## Verification to say which scenarios were re-run at ${head}, and add your own notes under ## Open decisions, keeping what is already there. Return the structured result.`
}

// Review notes and nits never block (PROCESS.md, "What blocks"), but they belong in the PR, whether or not
// a live run follows, so they are written there as soon as each review loop ends.
function notesPrompt(l, b, notes) {
  return `${COMMON(l)}

Record the non-blocking review notes for ${l.id} in its PR, ${b.prUrl}. Edit only the PR body: no code, no commits, no pushes. Read it with gh pr view ${b.prUrl} --json body, add each note below as a bullet under ## Open decisions (add that section before ## Blast Radius if it is missing), skip a note the body already covers, leave everything else unchanged, and write it back with gh pr edit ${b.prUrl} --body-file. Notes:
${notes.map((n) => `- ${n}`).join('\n')}`
}

const nitLine = (n) => `nit: ${n.summary}${n.file ? ` (${n.file}${n.line ? ':' + n.line : ''})` : ''}`
const reviewNotes = (r) => [...new Set([...r.notes, ...r.nits.map(nitLine)])]

async function recordNotes(l, b, notes, tag) {
  if (!notes.length) return
  await agent(notesPrompt(l, b, notes), { model: OPUS, effort: 'medium', label: `${l.id} notes ${tag}`, phase: 'Review' })
}

const seriousOf = (vs) => vs.flatMap((v) => v.findings).filter((f) => f.severity !== 'nit')

// Gates and review in parallel at each head; the owner fixes until both are clean or the rounds run out.
// Round 1 reviews `from`...head; later rounds review only the fix commits, against what they were meant to fix.
async function reviewLoop(l, b, from, startHead, focus, maxRounds, tag) {
  let head = startHead
  let reviewFrom = from
  let reviewFocus = focus
  const rounds = []
  const notes = []
  const nits = []
  for (let round = 1; round <= maxRounds; round++) {
    const [g, r] = await parallel([
      () => agent(gatesPrompt(l, b, head), { model: OPUS, effort: 'medium', label: `${l.id} gates ${tag}${round}`, phase: 'Review', schema: VERDICT_SCHEMA }),
      () => agent(reviewPrompt(l, b, reviewFrom, head, reviewFocus), { model: OPUS, effort: 'high', label: `${l.id} review ${tag}${round}`, phase: 'Review', schema: VERDICT_SCHEMA }),
    ])
    const got = [g, r].filter(Boolean)
    for (const v of got) {
      notes.push(...(v.notes || []))
      nits.push(...v.findings.filter((f) => f.severity === 'nit'))
    }
    const serious = seriousOf(got)
    const clean = got.length === 2 && serious.length === 0
    rounds.push({ round, head, clean, serious, missing: 2 - got.length })
    log(`${l.id} ${tag}review round ${round} at ${head}: ${clean ? 'clean' : got.length < 2 ? 'a reviewer returned nothing' : serious.length + ' to fix'}`)
    if (clean || round === maxRounds) break
    // A reviewer that returned nothing gives the owner nothing to fix; just run the round again.
    if (!serious.length) continue
    const fix = await agent(
      fixPrompt(l, b, head, 'Gates and code review found these:', JSON.stringify(serious, null, 1)),
      { model: OPUS, effort: l.effort, label: `${l.id} fix ${tag}r${round}`, phase: 'Fix', schema: FIX_SCHEMA },
    )
    if (!fix) break
    if (fix.nativeChanges) b.nativeChanges = true
    reviewFrom = head
    reviewFocus = JSON.stringify(serious, null, 1)
    head = fix.headSha
  }
  const last = rounds[rounds.length - 1]
  return { head, clean: last.clean, open: last.clean ? [] : last.serious, rounds: rounds.length, notes, nits }
}

async function prepareApk(l, b, head) {
  if (!b.nativeChanges) return null
  const apk = await agent(apkPrompt(l, b, head), { model: OPUS, effort: 'medium', label: `${l.id} apk`, phase: 'Live', schema: APK_SCHEMA })
  if (!apk || !apk.ok) throw new Error(`${l.id} native build failed: ${apk ? apk.evidence : 'no result'}`)
  return apk.apkPath
}

const notRun = (name, why) => ({ name, result: 'NOT RUN', evidence: why, flow: '' })

async function runLane(l) {
  const b = await agent(buildPrompt(l), { model: OPUS, effort: l.effort, isolation: 'worktree', label: `${l.id} owner`, phase: 'Build', schema: BUILD_SCHEMA })
  if (!b) throw new Error(`${l.id}: the owner returned nothing`)
  log(`${l.id} PR opened: ${b.prUrl} at ${b.headSha}.`)

  let review = await reviewLoop(l, b, `origin/${l.base}`, b.headSha, '', MAX_REVIEW_ROUNDS, '')
  await recordNotes(l, b, reviewNotes(review), 'review')
  const notes = [...b.openDecisions, ...reviewNotes(review)]
  let head = review.head
  const live = { runs: [], scenarios: [], problems: [], notes: [], skipped: '' }
  let apkPath = null

  if (!l.live) {
    live.skipped = 'the lane names no live scenarios'
  } else if (!review.clean && !LIVE_DESPITE_OPEN_REVIEW) {
    live.skipped = `code review not clean after ${review.rounds} rounds, so no emulator time was spent; resolve the open findings, then run the live proof`
    log(`${l.id} live proof skipped: ${live.skipped}.`)
  } else {
    try {
      apkPath = await prepareApk(l, b, head)
    } catch (e) {
      live.skipped = String(e)
    }
  }
  if (l.live && !live.skipped) {
    log(`${l.id} waiting for an emulator slot at ${head}.`)
    const first = await withSlot(() => agent(livePrompt(l, b, head, apkPath), { model: OPUS, effort: 'high', label: `${l.id} live`, phase: 'Live', schema: LIVE_SCHEMA }))
    live.runs.push({ head, runId: first ? first.runId : '', slot: first ? first.slot : '' })
    live.scenarios = first ? first.scenarios : [notRun('live proof', 'the live agent returned nothing')]
    live.problems = first ? first.problems : []
    live.notes.push(...(first ? first.notes : []))

    for (let round = 1; round <= MAX_LIVE_ROUNDS; round++) {
      const failed = live.scenarios.filter((s) => s.result === 'FAIL')
      if (!failed.length && !live.problems.length) break
      const items = [
        ...failed.map((s) => `Live scenario FAILED: ${s.name}. Evidence: ${s.evidence}. Flow: ${s.flow}`),
        ...live.problems.map((p) => `Live problem: ${p}`),
      ].join('\n')
      const fix = await agent(fixPrompt(l, b, head, 'The live proof found these:', items), { model: OPUS, effort: l.effort, label: `${l.id} fix live r${round}`, phase: 'Fix', schema: FIX_SCHEMA })
      if (!fix) break
      if (fix.nativeChanges) b.nativeChanges = true
      const fixReview = await reviewLoop(l, b, head, fix.headSha, items, MAX_REVIEW_ROUNDS, `live r${round} `)
      await recordNotes(l, b, reviewNotes(fixReview), `live r${round}`)
      notes.push(...reviewNotes(fixReview))
      const prevHead = head
      head = fixReview.head
      review = { ...review, head, clean: fixReview.clean, open: fixReview.open }
      if (!fixReview.clean) {
        log(`${l.id} the fix for the live failures did not clear review; not re-running live.`)
        break
      }
      if (fix.nativeChanges) {
        try {
          apkPath = await prepareApk(l, b, head)
        } catch (e) {
          live.notes.push(`re-test not run: ${String(e)}`)
          break
        }
      }
      // Only failed scenarios are re-run; a live problem without a failed scenario is replayed through every saved flow.
      const rerun = failed.length ? failed : live.scenarios.filter((s) => s.flow)
      const again = await withSlot(() => agent(retestPrompt(l, b, head, apkPath, rerun, prevHead), { model: OPUS, effort: 'high', label: `${l.id} live r${round + 1}`, phase: 'Live', schema: LIVE_SCHEMA }))
      live.runs.push({ head, runId: again ? again.runId : '', slot: again ? again.slot : '' })
      const fresh = again ? again.scenarios : rerun.map((s) => notRun(s.name, 'the re-test agent returned nothing'))
      live.scenarios = live.scenarios.map((s) => fresh.find((f) => f.name === s.name) || s)
      for (const f of fresh) if (!live.scenarios.some((s) => s.name === f.name)) live.scenarios.push(f)
      live.problems = again ? again.problems : []
      live.notes.push(...(again ? again.notes : []))
    }
  }

  const problems = [
    ...review.open.map((f) => `review ${f.severity}: ${f.summary}${f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : ''}`),
    ...live.scenarios.filter((s) => s.result === 'FAIL').map((s) => `live FAIL: ${s.name}: ${s.evidence}`),
    ...live.problems.map((p) => `live problem: ${p}`),
  ]
  return {
    id: l.id,
    pr: b.prUrl,
    branch: l.branch,
    base: l.base,
    worktree: b.worktree,
    head,
    review: { clean: review.clean, open: review.open },
    live: { skipped: live.skipped, runs: live.runs, scenarios: live.scenarios },
    problems,
    notes: [...new Set([...notes, ...live.notes])],
    notRun: live.scenarios.filter((s) => s.result === 'NOT RUN').map((s) => `${s.name}: ${s.evidence}`),
  }
}

// A lane whose base is another lane's branch waits for that lane, so it builds on reviewed code.
const running = {}
function start(l) {
  if (!running[l.id]) {
    running[l.id] = (async () => {
      const parent = byBranch[l.base]
      if (parent) {
        const p = await start(parent)
        if (!p || p.error) return { id: l.id, error: `not started: ${parent.id}, which it stacks on, failed` }
        log(`${parent.id} finished at ${p.head}; starting ${l.id} on ${l.base}.`)
      }
      return runLane(l).catch((e) => ({ id: l.id, error: String(e) }))
    })()
  }
  return running[l.id]
}

const results = await parallel(LANES.map((l) => () => start(l)))
return results.map((r, i) => r || { id: LANES[i].id, error: 'lane returned nothing' })
