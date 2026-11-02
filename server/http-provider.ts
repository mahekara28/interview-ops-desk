import { normalizeSnapshot, parseSnapshot, type RecruitingProvider } from './contracts.js';
import { DeskError } from './engine.js';
import type { Connection } from '../src/shared.js';

/** A team can implement this JSON endpoint without changing the rules, UI, or MCP tools. */
export class HttpSnapshotProvider implements RecruitingProvider {
  get connections(): Connection[] {
    return [
      {
        id: 'custom',
        title: 'Custom JSON API',
        status: this.config.providerUrl ? 'configured' : 'unconfigured',
        detail: 'Versioned snapshot endpoint · read-only',
      },
      {
        id: 'calendar',
        title: 'Calendar evidence',
        status: 'unconfigured',
        detail: 'Included in the custom provider response when available',
      },
    ];
  }
  readonly descriptor = {
    id: 'json-http',
    label: 'Custom JSON API',
    workspace: 'live' as const,
    capabilities: [
      'interviews',
      'application-identity',
      'calendar-evidence',
      'recorded-confirmations',
    ],
  };
  constructor(
    public config: { providerUrl?: string; providerToken?: string },
    private request: typeof fetch = fetch,
  ) {}
  async sync() {
    if (!this.config.providerUrl)
      throw new DeskError(409, 'Set OPS_PROVIDER_URL to your snapshot API endpoint.');
    const url = new URL(this.config.providerUrl);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
    )
      throw new DeskError(
        400,
        'Provider URL must use HTTPS, or HTTP on loopback. Keep credentials in OPS_PROVIDER_TOKEN.',
      );
    let response: Response;
    try {
      response = await this.request(url, {
        headers: this.config.providerToken
          ? { Authorization: `Bearer ${this.config.providerToken}` }
          : {},
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new DeskError(
        502,
        'Custom provider could not be reached. Previous evidence was retained.',
      );
    }
    if (!response.ok)
      throw new DeskError(
        502,
        `Custom provider returned HTTP ${response.status}. Previous evidence was retained.`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new DeskError(502, 'Custom provider returned an empty response.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 256 * 1024)
          throw new DeskError(
            502,
            'Snapshot exceeds the 256 KB limit. Return a smaller complete scope.',
          );
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const data = parseSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const records = normalizeSnapshot(data).map((record) => ({
      ...record,
      id: record.id.replace('import-', 'api-'),
      mode: 'live' as const,
      source: {
        ...record.source,
        kind: data.workspace.kind === 'synthetic' ? ('synthetic' as const) : ('api' as const),
      },
    }));
    return { records, skipped: 0 };
  }
}
