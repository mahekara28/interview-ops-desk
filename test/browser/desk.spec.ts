import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { sampleSnapshot } from '../../server/sample-snapshot.js';
async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}
test.beforeEach(async ({ request }) => {
  await request.post('/api/demo/reset', { headers: { 'X-Ops-Request': 'dashboard' }, data: {} });
});
test('coordinator reviews, simulates failure, retries and sees one receipt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Candidate needs an updated confirmation' }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, message: n.failureSummary })),
    })),
  ).toEqual([]);
  await capture(page, 'desk-overview');
  await page.getByRole('button', { name: 'Prepare candidate update' }).click();
  await expect(page.getByLabel('Candidate message')).toContainText('Hi Maya');
  await capture(page, 'desk-draft');
  await page.getByLabel('Simulate a delivery timeout').check();
  await page.getByRole('button', { name: 'Approve demo delivery' }).click();
  await expect(page.getByText('Simulated delivery failed')).toBeVisible();
  await capture(page, 'desk-recovery');
  await page.getByRole('button', { name: 'Retry approved update' }).click();
  await expect(page.getByRole('heading', { name: 'A clearer handoff.' })).toBeVisible();
  await expect(page.getByText('The recorded details agree.')).toBeVisible();
  await page.getByRole('status').waitFor({ state: 'hidden' });
  await capture(page, 'desk-receipt');
  const state = await (await page.request.get('/api/state')).json();
  expect(state.activity.filter((a: { kind: string }) => a.kind === 'receipt')).toHaveLength(1);
  expect(errors).toEqual([]);
});
test('source issues block drafting until corrected; changing time invalidates current draft', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Sofia Reed' }).click();
  await expect(page.getByRole('button', { name: 'Prepare candidate update' })).toBeDisabled();
  await page.getByRole('button', { name: 'Simulate source correction' }).click();
  await page.getByRole('button', { name: 'Prepare candidate update' }).click();
  await expect(page.getByLabel('Candidate message')).toBeVisible();
  await page.getByRole('button', { name: 'Move interview +1h' }).click();
  await expect(page.getByLabel('Candidate message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Prepare candidate update' })).toBeEnabled();
});
test('connections explain MCP and live workspace does not display fictional records', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page.getByText('The API brings the facts.')).toBeVisible();
  await capture(page, 'desk-connections');
  const config = await (await page.request.get('/api/mcp-config')).json();
  expect(config.mcpServers['interview-ops-desk'].args[2]).toMatch(/server\/mcp.ts$/);
  await page.getByLabel('Workspace mode').selectOption('live');
  await page.getByRole('button', { name: 'Coordination', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your source of truth.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sync sources' }).click();
  await expect(page.getByRole('alert')).toContainText('Greenhouse is not configured');
});
test('mobile and narrow layouts remain usable; native dialog handles Escape', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Open demo guide' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width === 390) await capture(page, 'desk-mobile');
  }
});

test('a real MCP proposal appears in the open dashboard without a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
  const client = new Client({ name: 'browser-integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/mcp.ts')],
    env: { OPS_DATA_DIR: resolve('.data/browser-test') },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'prepare_candidate_update',
      arguments: { interviewId: 'demo-1', revision: 1, tone: 'warm' },
    });
    expect(result.isError).toBeFalsy();
    await expect(page.getByText('Prepared through MCP')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Approve demo delivery' })).toBeVisible();
    const state = await (await page.request.get('/api/state')).json();
    expect(state.activity.filter((a: { kind: string }) => a.kind === 'receipt')).toHaveLength(0);
  } finally {
    await client.close();
  }
});

test('template preview imports evidence, exposes the same brief through MCP, and only exports drafts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Template', exact: true }).click();
  await page.getByRole('button', { name: 'Preview sample snapshot' }).click();
  await expect(page.getByRole('region', { name: 'Snapshot preview' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Maya Chen application-1' })).toBeVisible();
  await capture(page, 'template-preview');
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Import reviewed snapshot' }).click();
  await page.getByRole('button', { name: 'Open imported workspace' }).click();
  await expect(page.getByLabel('Workspace mode')).toHaveValue('imported');
  await expect(page.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
  await page.locator('.candidate-brief summary').click();
  await expect(page.getByText('sample-ats · synthetic')).toBeVisible();
  const client = new Client({ name: 'template-browser-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/mcp.ts')],
    env: { OPS_DATA_DIR: resolve('.data/browser-test') },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: 'get_candidate_brief',
      arguments: { workspace: 'imported', applicationId: 'application-1' },
    });
    const brief = JSON.parse((response.content as { text: string }[])[0].text);
    expect(brief.candidate.name).toBe('Maya Chen');
    await client.callTool({
      name: 'prepare_follow_up',
      arguments: {
        interviewId: brief.interviews[0].interviewId,
        revision: brief.interviews[0].revision,
      },
    });
    await expect(page.getByText('Prepared through MCP')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Approve demo delivery' })).toHaveCount(0);
    await expect(page.getByLabel('Candidate message')).toContainText('Hi Maya');
    await capture(page, 'template-brief');
  } finally {
    await client.close();
  }
});

test('template rejects malformed files with useful feedback and fits narrow screens', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Template', exact: true }).click();
  const sample = sampleSnapshot();
  sample.interviews[0].candidate.timezone = 'Invalid/Zone';
  await page.getByLabel('Choose JSON file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sample)),
  });
  await expect(page.getByRole('alert')).toContainText('valid IANA time zone');
  await expect(page.getByRole('button', { name: 'Import reviewed snapshot' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview sample snapshot' }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 390) await capture(page, 'template-mobile');
  }
});
