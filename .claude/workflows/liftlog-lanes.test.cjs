const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const source = fs.readFileSync(path.join(__dirname, 'liftlog-lanes.js'), 'utf8')
const workflow = new AsyncFunction('args', 'agent', 'parallel', 'log', source.replace('export const meta', 'const meta'))
const parallel = (tasks) => Promise.all(tasks.map((task) => task()))

const pass = { verdict: 'PASS', findings: [], notes: [] }
const defect = {
  severity: 'blocker',
  file: 'app/src/example.ts',
  line: 1,
  summary: 'Saving loses the workout',
  evidence: 'Reopening the saved workout shows no sets',
}
const fail = { verdict: 'FAIL', findings: [defect], notes: [] }
const parent = { id: 'parent', branch: 'parent', title: 'Save workouts', spec: 'Keep saved sets', live: 'Save a workout' }
const child = { id: 'child', branch: 'child', base: 'parent', title: 'Show workouts', spec: 'Show saved sets' }

function build(id) {
  return {
    worktree: `/tmp/${id}`,
    branch: id,
    headSha: `${id}0`,
    prUrl: `https://example.com/${id}`,
    summary: 'Implemented saving',
    gates: 'All gates passed',
    nativeChanges: false,
    openDecisions: [],
  }
}

function fix(headSha, nativeChanges = false) {
  return { headSha, fixed: ['Saving loses the workout'], dismissed: [], nativeChanges, gates: 'All gates passed' }
}

function live(result, problems = []) {
  return {
    runId: 'run-1',
    slot: '1',
    scenarios: [{ name: 'Save a workout', result, evidence: 'Checked saved sets', flow: '/tmp/save-workout.yaml' }],
    prAssetsSha: 'assets1',
    prBodyUpdated: true,
    problems,
    notes: [],
  }
}

async function run(args, respond) {
  const calls = []
  const results = await workflow(args, async (prompt, options) => {
    calls.push({ prompt, ...options })
    return respond(prompt, options)
  }, parallel, () => {})
  return { results, calls }
}

for (const reviewer of ['gates', 'review']) {
  test(`${reviewer} FAIL with empty findings prevents live proof and stays unclean`, async () => {
    const { results, calls } = await run({ maxReviewRounds: 1, lanes: [parent] }, (prompt, options) => {
      if (options.label === 'parent owner') return build('parent')
      if (options.label === `parent ${reviewer} 1`) return { verdict: 'FAIL', findings: [], notes: ['The check failed'] }
      if (options.schema?.properties.verdict) return pass
      if (options.schema?.properties.scenarios) return live('PASS')
    })

    assert.equal(calls.some((call) => call.label === 'parent live'), false)
    assert.equal(results[0].review.clean, false)
    assert.match(results[0].live.skipped, /review not clean/)
  })
}

test('a native review fix after a JS live fix rebuilds the APK at the final reviewed head', async () => {
  const { results, calls } = await run({ lanes: [parent] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'parent live') return live('FAIL')
    if (options.label === 'parent fix live r1') return fix('parent1')
    if (options.label === 'parent review live r1 1') return fail
    if (options.label === 'parent fix live r1 r1') return fix('parent2', true)
    if (options.schema?.properties.verdict) return pass
    if (options.schema?.properties.apkPath) return { ok: true, apkPath: '/tmp/parent2.apk', evidence: 'BUILD SUCCESSFUL' }
    if (options.label === 'parent live r2') return live('PASS')
  })

  assert.equal(results[0].head, 'parent2')
  assert.equal(results[0].review.clean, true)
  const apkCalls = calls.filter((call) => call.schema?.properties.apkPath)
  assert.equal(apkCalls.length, 1)
  assert.match(apkCalls[0].prompt, /at parent2/)
  const retest = calls.find((call) => call.label === 'parent live r2')
  assert.ok(calls.indexOf(apkCalls[0]) < calls.indexOf(retest))
  assert.match(retest.prompt, /at parent2/)
  assert.match(retest.prompt, /APK: use the one built for this branch at \/tmp\/parent2\.apk/)
  assert.equal(results[0].live.scenarios[0].result, 'PASS')
})

test('an exhausted parent review prevents the stacked child from starting', async () => {
  const { results, calls } = await run({ maxReviewRounds: 1, lanes: [parent, child] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'child owner') return build('child')
    if (options.label === 'parent review 1') return fail
    if (options.schema?.properties.verdict) return pass
  })

  assert.equal(results[0].review.clean, false)
  assert.deepEqual(results[0].problems, ['review blocker: Saving loses the workout (app/src/example.ts:1)'])
  assert.equal(calls.some((call) => call.label === 'child owner'), false)
  assert.match(results[1].error, /not started.*parent/)
})

test('an exhausted parent live FAIL prevents the stacked child from starting', async () => {
  const { results, calls } = await run({ maxLiveRounds: 1, lanes: [parent, child] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'child owner') return build('child')
    if (options.schema?.properties.verdict) return pass
    if (options.label === 'parent fix live r1') return fix('parent1')
    if (options.schema?.properties.scenarios) return live('FAIL')
  })

  assert.deepEqual(results[0].problems, ['live FAIL: Save a workout: Checked saved sets'])
  assert.equal(calls.filter((call) => call.schema?.properties.scenarios).length, 2)
  assert.equal(calls.some((call) => call.label === 'child owner'), false)
  assert.match(results[1].error, /not started.*parent/)
})

test('unresolved parent live problems prevent the stacked child even when scenarios pass', async () => {
  const { results, calls } = await run({ maxLiveRounds: 1, lanes: [parent, child] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'child owner') return build('child')
    if (options.schema?.properties.verdict) return pass
    if (options.label === 'parent fix live r1') return fix('parent1')
    if (options.schema?.properties.scenarios) return live('PASS', ['Deleting one workout deletes another'])
  })

  assert.equal(results[0].live.scenarios[0].result, 'PASS')
  assert.deepEqual(results[0].problems, ['live problem: Deleting one workout deletes another'])
  assert.equal(calls.some((call) => call.label === 'child owner'), false)
  assert.match(results[1].error, /not started.*parent/)
})

test('a passing parent finishes its live proof before the stacked child starts', async () => {
  let parentLiveFinished = false
  const { results, calls } = await run({ lanes: [parent, child] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'child owner') {
      assert.equal(parentLiveFinished, true)
      return build('child')
    }
    if (options.schema?.properties.verdict) return pass
    if (options.label === 'parent live') {
      parentLiveFinished = true
      return live('PASS')
    }
  })

  assert.deepEqual(results.map((result) => result.problems), [[], []])
  assert.deepEqual(results.map((result) => result.review.clean), [true, true])
  assert.equal(calls.filter((call) => call.label === 'child owner').length, 1)
})

test('NOT RUN remains nonblocking and is reported when the stacked child starts', async () => {
  const { results, calls } = await run({ lanes: [parent, child] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'child owner') return build('child')
    if (options.schema?.properties.verdict) return pass
    if (options.label === 'parent live') return {
      ...live('NOT RUN'),
      scenarios: [{ name: 'Save a workout', result: 'NOT RUN', evidence: 'Emulator permission denied', flow: '' }],
    }
  })

  assert.deepEqual(results[0].problems, [])
  assert.deepEqual(results[0].notRun, ['Save a workout: Emulator permission denied'])
  assert.equal(calls.some((call) => call.phase === 'Fix'), false)
  assert.equal(calls.filter((call) => call.label === 'child owner').length, 1)
  assert.equal(results[1].review.clean, true)
})

test('JS-only live fixes re-test saved failed scenarios without building an APK', async () => {
  const { results, calls } = await run({ lanes: [parent] }, (prompt, options) => {
    if (options.label === 'parent owner') return build('parent')
    if (options.label === 'parent live') return live('FAIL')
    if (options.label === 'parent fix live r1') return fix('parent1')
    if (options.schema?.properties.verdict) return pass
    if (options.label === 'parent live r2') return live('PASS')
  })

  assert.equal(calls.some((call) => call.schema?.properties.apkPath), false)
  const retest = calls.find((call) => call.label === 'parent live r2')
  assert.match(retest.prompt, /at parent1/)
  assert.match(retest.prompt, /flow: \/tmp\/save-workout\.yaml/)
  assert.match(retest.prompt, /the diff has no native changes/)
  assert.deepEqual(results[0].problems, [])
  assert.deepEqual(results[0].live.runs.map((run) => run.head), ['parent0', 'parent1'])
})
