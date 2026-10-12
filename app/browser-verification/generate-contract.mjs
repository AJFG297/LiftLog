#!/usr/bin/env node
import { createGenerator } from 'ts-json-schema-generator';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const schema = createGenerator({
  path: fileURLToPath(new URL('../src/models/storage/versions/latest/session.ts', import.meta.url)),
  tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  type: 'SessionJSON',
  skipTypeCheck: true,
  additionalProperties: true,
}).createSchema('SessionJSON');
writeFileSync(new URL('session.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
