import Ajv from 'ajv';

/** @typedef {{runId: string, runDirectory: string, checkout: string, pid?: number, url?: string}} PendingState */
/** @typedef {PendingState & {pid: number, url: string}} ActiveState */
/** @typedef {{runId: string, checkout: string, pid: number, url: string, source: string, databasePath: string}} Identity */
/** @typedef {{position: number, reps: number|null, weight_value: string, weight_unit: string, completed_at: string|null}} WeightedRow */
/** @typedef {{databasePath: string, query: {weightedSets: string, activeWorkout: string}, weightedSets: WeightedRow[], activeWorkout: object|null}} SqlEvidence */

const validator = new Ajv();
const stateProperties = {
  runId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]*$' },
  runDirectory: { type: 'string', minLength: 1 },
  checkout: { type: 'string', minLength: 1 },
  pid: { type: 'integer', minimum: 1 },
  url: { type: 'string', pattern: '^http://127\\.0\\.0\\.1:[0-9]+$' },
};
/** @type {import('ajv').ValidateFunction<PendingState>} */
const pending = validator.compile({
  type: 'object',
  required: ['runId', 'runDirectory', 'checkout'],
  properties: stateProperties,
  additionalProperties: false,
});
/** @type {import('ajv').ValidateFunction<ActiveState>} */
const active = validator.compile({
  type: 'object',
  required: Object.keys(stateProperties),
  properties: stateProperties,
  additionalProperties: false,
});
/** @type {import('ajv').ValidateFunction<Identity>} */
const identity = validator.compile({
  type: 'object',
  required: ['runId', 'checkout', 'pid', 'url', 'source', 'databasePath'],
  properties: {
    runId: stateProperties.runId,
    checkout: stateProperties.checkout,
    pid: stateProperties.pid,
    url: stateProperties.url,
    source: { type: 'string' },
    databasePath: { type: 'string' },
  },
  additionalProperties: false,
});
/** @type {import('ajv').ValidateFunction<SqlEvidence>} */
const evidence = validator.compile({
  type: 'object',
  required: ['databasePath', 'query', 'weightedSets', 'activeWorkout'],
  additionalProperties: false,
  properties: {
    databasePath: { type: 'string' },
    query: {
      type: 'object',
      required: ['weightedSets', 'activeWorkout'],
      properties: { weightedSets: { type: 'string' }, activeWorkout: { type: 'string' } },
      additionalProperties: false,
    },
    activeWorkout: { type: ['object', 'null'] },
    weightedSets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['position', 'reps', 'weight_value', 'weight_unit', 'completed_at'],
        additionalProperties: false,
        properties: {
          position: { type: 'integer' },
          reps: { type: ['integer', 'null'] },
          weight_value: { type: 'string' },
          weight_unit: { type: 'string' },
          completed_at: { type: ['string', 'null'] },
        },
      },
    },
  },
});
/** @param {unknown} value @returns {PendingState} */
export function parsePendingState(value) {
  if (!pending(value)) throw new Error('Invalid verification state');
  return value;
}
/** @param {unknown} value @returns {ActiveState} */
export function parseActiveState(value) {
  if (!active(value)) throw new Error('Verification instance is not ready');
  return value;
}
/** @param {unknown} value @returns {Identity} */
export function parseIdentity(value) {
  if (!identity(value)) throw new Error('Invalid verification identity');
  return value;
}
/** @param {unknown} value @returns {SqlEvidence} */
export function parseEvidence(value) {
  if (!evidence(value)) throw new Error('Invalid SQL evidence');
  return value;
}
/** @param {unknown} error @param {string} code */
export function hasCode(error, code) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
