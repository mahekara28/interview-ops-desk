import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../server/store.js';
import { sampleSnapshot } from '../server/sample-snapshot.js';
import type { candidateBrief, coordinationGaps, candidateChanges } from '../server/workflows.js';
import type { Proposal } from '../src/shared.js';

const directory = mkdtempSync(join(tmpdir(), 'recruiting-template-'));
const store = new Store(join(directory, 'desk.sqlite'));
const snapshot = sampleSnapshot();
store.importSnapshot(snapshot, 0);
const client = new Client({ name: 'template-walkthrough', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/mcp.ts')],
  env: { OPS_DATA_DIR: directory },
  stderr: 'pipe',
});
async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError) throw new Error(`MCP tool ${name} failed.`);
  return JSON.parse((response.content as { text: string }[])[0].text);
}
try {
  await client.connect(transport);
  const gaps = await call<ReturnType<typeof coordinationGaps>>('list_coordination_gaps', {
    workspace: 'imported',
  });
  console.log(
    `1. Found ${gaps.cases.length} coordination gaps across ${gaps.examined} fictional interviews.`,
  );
  const brief = await call<ReturnType<typeof candidateBrief>>('get_candidate_brief', {
    workspace: 'imported',
    applicationId: 'application-1',
  });
  const interview = brief.interviews[0];
  console.log(
    `2. Brief for ${brief.candidate.name}: ${interview.findings[0].title}. Source: ${interview.source.provider}/${interview.source.recordId}; kind: ${interview.source.kind}.`,
  );
  const draft = await call<Proposal>('prepare_follow_up', {
    interviewId: interview.interviewId,
    revision: interview.revision,
  });
  console.log(`3. Follow-up status: ${draft.status}. Local proposal only; no delivery.`);
  snapshot.interviews[0].role = 'Platform Engineer II';
  snapshot.capturedAt = new Date().toISOString();
  store.importSnapshot(snapshot, 1);
  const changes = await call<ReturnType<typeof candidateChanges>>('get_candidate_changes', {
    workspace: 'imported',
    applicationId: 'application-1',
    since: '2000-01-01T00:00:00Z',
  });
  console.log(
    `4. Observed ${changes.changes.length} revision change. The previous draft is now stale.`,
  );
  const stale = await client.callTool({
    name: 'prepare_follow_up',
    arguments: { interviewId: interview.interviewId, revision: interview.revision },
  });
  if (!stale.isError) throw new Error('Expected the stale revision to be rejected.');
  console.log('5. Stale proposal request rejected. Walkthrough passed using real MCP stdio calls.');
} finally {
  await client.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
