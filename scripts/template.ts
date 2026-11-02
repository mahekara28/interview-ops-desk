import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { parseSnapshot, snapshotJsonSchema } from '../server/contracts.js';
import { sampleSnapshot } from '../server/sample-snapshot.js';
import { Store } from '../server/store.js';
import { dataPath } from '../server/config.js';

const [command, file] = process.argv.slice(2);
try {
  if (command === 'schema') {
    if (!file) throw new Error('Provide an output file path.');
    writeFileSync(file, JSON.stringify(snapshotJsonSchema, null, 2) + '\n');
    console.log(
      'Schema written. Runtime validation also checks dates, identity uniqueness and time zones.',
    );
  } else if (command === 'sample') {
    if (!file) throw new Error('Provide an output file path.');
    writeFileSync(file, JSON.stringify(sampleSnapshot(), null, 2) + '\n');
    console.log('Fictional snapshot written.');
  } else if (command === 'validate' || command === 'import') {
    if (!file) throw new Error('Provide a snapshot file path.');
    const input = readFileSync(file);
    if (input.byteLength > 240 * 1024) throw new Error('Snapshot exceeds 240 KB.');
    const snapshot = parseSnapshot(JSON.parse(input.toString('utf8')));
    if (command === 'validate')
      console.log(
        `Valid schema 1.0 snapshot: ${snapshot.interviews.length} interviews. No state changed.`,
      );
    else {
      const store = new Store(dataPath);
      try {
        const result = store.importSnapshot(snapshot, Number(store.meta('importVersion') ?? 0));
        console.log(
          `Imported ${result.count} interviews. Only the imported workspace was replaced; no live APIs were contacted.`,
        );
      } finally {
        store.close();
      }
    }
  } else throw new Error('Usage: npm run template -- <validate|import|sample|schema> <file>');
} catch (error) {
  if (error instanceof z.ZodError)
    console.error(
      'Invalid snapshot fields:',
      error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  else
    console.error(
      error instanceof SyntaxError
        ? 'Invalid JSON.'
        : error instanceof Error
          ? error.message
          : 'Template command failed.',
    );
  process.exitCode = 1;
}
