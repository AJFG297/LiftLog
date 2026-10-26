const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'app');
const { createFingerprintAsync, diffFingerprints } = require(path.join(root, 'node_modules/@expo/fingerprint'));
const schema = path.resolve(root, '../docs/schemas/workout-worker/WorkerWorkout.json');
(async () => {
  const original = await fs.readFile(schema);
  const before = await createFingerprintAsync(root, { platforms: ['android'], silent: true });
  let after;
  try {
    await fs.writeFile(schema, Buffer.concat([original, Buffer.from('\n')]));
    after = await createFingerprintAsync(root, { platforms: ['android'], silent: true });
    assert.notEqual(before.hash, after.hash);
    const changes = diffFingerprints(before, after);
    const changedSchema = changes.find(change => change.op === 'changed' && change.beforeSource.filePath === '../docs/schemas/workout-worker');
    assert.ok(changedSchema, 'The actual worker schema directory must change the runtime fingerprint');
    console.log(JSON.stringify({before: before.hash, after: after.hash, changes}, null, 2));
  } finally {
    await fs.writeFile(schema, original);
  }
  const restored = await createFingerprintAsync(root, { platforms: ['android'], silent: true });
  assert.equal(restored.hash, before.hash, 'Restored schema must restore the original fingerprint');
  console.log('PASS: schema change affects the Android runtime fingerprint; restoring it restores the hash.');
})().catch(error => { console.error(error); process.exitCode = 1; });
