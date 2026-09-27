import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import migrations from '@/drizzle/migrations';

/**
 * The app applies the migrations `migrations.js` imports, keyed by the journal. Vitest's migrator reads the
 * folder instead, so a migration missing from `migrations.js` would pass every test and never run on a
 * device.
 */
describe('drizzle migrations', () => {
  const { journal, migrations: bundled } = migrations as {
    journal: { entries: { idx: number; tag: string }[] };
    migrations: Record<string, string>;
  };
  const folder = readdirSync(__dirname)
    .filter((x) => x.endsWith('.sql'))
    .map((x) => x.replace(/\.sql$/, ''))
    .sort();

  it('journals every migration in the folder, in order', () => {
    expect(journal.entries.map((x) => x.tag)).toEqual(folder);
    expect(journal.entries.map((x) => x.idx)).toEqual(folder.map((_, i) => i));
  });

  it('bundles every journalled migration', () => {
    const expectedKeys = journal.entries.map((x) => `m${String(x.idx).padStart(4, '0')}`);
    expect(Object.keys(bundled)).toEqual(expectedKeys);
    for (const key of expectedKeys) {
      expect(bundled[key]).toEqual(expect.any(String));
    }
  });

  it('bundles each migration from its own file', () => {
    for (const entry of journal.entries) {
      const key = `m${String(entry.idx).padStart(4, '0')}`;
      expect(bundled[key]).toBe(readFileSync(resolve(__dirname, `${entry.tag}.sql`), 'utf8'));
    }
  });

  // Vitest's transform tolerates a repeated import binding; Metro rejects the whole bundle.
  it('imports each migration exactly once', () => {
    const source = readFileSync(resolve(__dirname, 'migrations.js'), 'utf8');
    const imports = [...source.matchAll(/^import (m\d{4}) from '\.\/(.+)\.sql';$/gm)].map((x) => [x[1], x[2]]);
    expect(imports).toEqual(journal.entries.map((x) => [`m${String(x.idx).padStart(4, '0')}`, x.tag]));
  });
});
