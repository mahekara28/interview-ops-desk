import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../server/store.js';

test('real stdio MCP client inspects and proposes into the same dashboard store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'interview-mcp-'));
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/mcp.ts')],
    env: {
      ...(Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined),
      ) as Record<string, string>),
      OPS_DATA_DIR: dir,
    },
    stderr: 'pipe',
  });
  let store: Store | undefined;
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.deepEqual(list.tools.map((t) => t.name).sort(), [
      'get_candidate_brief',
      'get_candidate_changes',
      'get_coordination_activity',
      'inspect_interview',
      'list_coordination_gaps',
      'list_interview_cases',
      'prepare_candidate_update',
      'prepare_follow_up',
    ]);
    const result = await client.callTool({
      name: 'list_interview_cases',
      arguments: { workspace: 'demo' },
    });
    const cases = JSON.parse((result.content as { text: string }[])[0].text);
    assert.equal(cases.length, 4);
    const draft = await client.callTool({
      name: 'prepare_candidate_update',
      arguments: { interviewId: 'demo-1', revision: 1, tone: 'warm' },
    });
    assert.ok(!draft.isError);
    store = new Store(join(dir, 'desk.sqlite'));
    assert.equal(store.latestProposal('demo-1')!.source, 'mcp');
    assert.equal(store.latestProposal('demo-1')!.status, 'draft');
    assert.equal(store.activity('demo').filter((a) => a.kind === 'receipt').length, 0);
    const blocked = await client.callTool({
      name: 'prepare_candidate_update',
      arguments: { interviewId: 'demo-2', revision: 1 },
    });
    assert.equal(blocked.isError, true);
    const briefResult = await client.callTool({
      name: 'get_candidate_brief',
      arguments: { workspace: 'demo', applicationId: 'application-1' },
    });
    const brief = JSON.parse((briefResult.content as { text: string }[])[0].text);
    assert.equal(brief.candidate.name, 'Maya Chen');
    assert.equal(brief.interviews[0].source.kind, 'synthetic');
    assert.ok(brief.unavailable.length);
    store.demoEvent('demo-1', 1, 'shift', 'mcp-change');
    const changesResult = await client.callTool({
      name: 'get_candidate_changes',
      arguments: {
        workspace: 'demo',
        applicationId: 'application-1',
        since: '2000-01-01T00:00:00Z',
      },
    });
    assert.ok(
      JSON.parse((changesResult.content as { text: string }[])[0].text).changes[0].changes.some(
        (change: { field: string }) => change.field === 'ats.start',
      ),
    );
    const stale = await client.callTool({
      name: 'prepare_follow_up',
      arguments: { interviewId: 'demo-1', revision: 1 },
    });
    assert.equal(stale.isError, true);
    const gaps = await client.callTool({
      name: 'list_coordination_gaps',
      arguments: { workspace: 'demo' },
    });
    assert.equal(JSON.parse((gaps.content as { text: string }[])[0].text).cases.length, 4);
    const prompt = await client.getPrompt({
      name: 'interview-readiness',
      arguments: { workspace: 'demo' },
    });
    assert.equal(prompt.messages[0].role, 'user');
    const schema = await client.readResource({ uri: 'ops://schema/snapshot-v1' });
    assert.ok('text' in schema.contents[0]);
    const resource = await client.readResource({ uri: 'ops://workflow' });
    assert.ok('text' in resource.contents[0]);
    assert.match(resource.contents[0].text, /Live adapters are read-only/);
  } finally {
    store?.close();
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
