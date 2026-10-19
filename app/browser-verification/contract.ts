import Ajv from 'ajv';
import type { SessionJSON } from '@/models/storage/versions/latest';
import { Session } from '@/models/session-models/session';
import schema from './session.schema.json';

const validate = new Ajv({ strict: false, validateFormats: false }).compile<SessionJSON>(schema);
export function parseSession(value: unknown): Session {
  if (!validate(value)) throw new Error(`Invalid workout: ${JSON.stringify(validate.errors)}`);
  return Session.fromJSON(value);
}
