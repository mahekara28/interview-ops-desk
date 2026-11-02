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
      'get_coordination_activity',
      'inspect_interview',
      'list_interview_cases',
      'prepare_candidate_update',
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
    const resource = await client.readResource({ uri: 'ops://workflow' });
    assert.ok('text' in resource.contents[0]);
    assert.match(resource.contents[0].text, /Live adapters are read-only/);
  } finally {
    store?.close();
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
