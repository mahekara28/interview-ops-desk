# Connecting the desk

## Default demo

`npm ci && npm run build && npm start` creates a local SQLite database and seeds six fictional interviews. The app is available at `http://127.0.0.1:4310`. Nothing is sent to Greenhouse, Calendar, Slack, an email service or an LLM in demo mode. UI requests and MCP tools use the same application rules and data. Demo, imported and live workspaces are kept separate.

All credentials belong in environment variables or an ignored `.env` file. Use `.env.example` as a starting point. The dashboard displays connection state but never receives the credentials.

For validated file imports, the sample HTTP provider and the adapter contract, see [Template](TEMPLATE.md). Set `OPS_PROVIDER=greenhouse` (the default) for the following adapter, or `OPS_PROVIDER=json-http` for a custom snapshot endpoint.

## Greenhouse Harvest v3

This is a custom, internal integration using OAuth 2.0 Client Credentials. It requires administrator-authorized Harvest API access; a candidate/job-seeker account cannot provide this access.

1. In the authorized Greenhouse account, create **Harvest V3 (OAuth)** credentials.
2. Grant the `harvest:interviews:list` scope. The integration service user or authorizing user also needs the relevant account permissions. Greenhouse documents Site Admin authorization for list endpoints.
3. Set `GREENHOUSE_CLIENT_ID` and `GREENHOUSE_CLIENT_SECRET` in the local environment. `GREENHOUSE_USER_ID` is optional; without it, the associated integration service user is used.
4. Optionally set `GREENHOUSE_JOB_IDS` to a comma-separated list of job IDs.
5. Restart the desk, choose **Live workspace**, and select **Sync sources**.

The adapter posts a form to `https://auth.greenhouse.io/token`, using HTTP Basic client credentials and `grant_type=client_credentials`. It caches the access token in process memory and reads `https://harvest.greenhouse.io/v3/interviews` with Bearer authorization.

Requests cover scheduled interviews starting between now and 14 days from now. Pagination follows same-origin `/v3/interviews` links, with a 20-page safety limit. Authentication is renewed once after a 401. Rate limits, timeouts and schema errors fail the sync without replacing the last complete snapshot. Narrow the job scope for larger accounts.

Only timed, scheduled interviews are imported. All-day events, take-home assignments and other statuses are outside this prototype. The API feed contains application/job IDs; candidate identity enrichment is not implemented. The display time zone defaults to UTC because this feed does not establish a candidate time zone. No candidate email is guessed from a name or application ID.

The adapter has contract tests against the [documented v3 response](https://harvestdocs.greenhouse.io/reference/get_v3-interviews), but has not been exercised against a live Greenhouse account.

## Google Calendar

Set `GOOGLE_CALENDAR_ACCESS_TOKEN` to a short-lived OAuth token with `https://www.googleapis.com/auth/calendar.events.readonly` scope. Set `GOOGLE_CALENDAR_ID` to the authorized organizer's calendar ID (default: `primary`). Obtain and renew that token through your approved Google OAuth tooling; this prototype does not implement a sign-in or refresh-token flow.

The adapter reads individual events from:

```text
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{external_event_id}
```

It reads start/end times, video conference URLs and attendee responses. The Greenhouse external event ID must be a Google event ID accessible in the configured calendar. Outlook IDs, inaccessible events and unsupported all-day records will not produce fabricated Calendar evidence. No fuzzy matching by candidate name is attempted. A missing or inaccessible event is reported as unavailable evidence; it is not proof of cancellation.

The configured calendar must be the one that contains the imported interview events. Multiple organizer calendars are not supported by this prototype. Declined live attendees are labeled participants because the minimal interview feed does not establish whether each attendee is a candidate or interviewer.

## Candidate communication

Demo mode stores approval and simulated receipts in SQLite. The timeout switch fails before delivery. Retry uses the approved text, validates its evidence revision, and creates at most one local receipt for that proposal.

Live mode has **no email or inbox connector**. A confirmation is therefore unverified, not necessarily missing. Export the proposed text and review it in the team's approved tool. The prototype does not mark that export as delivery or candidate acknowledgement.

## MCP

Use **Connections → Copy MCP configuration** in the running dashboard. It produces an `mcpServers` entry with your exact Node executable, TypeScript loader, server path and data directory. This is suitable for clients supporting that JSON shape and stdio. Other clients can use the same command, arguments and environment in their own config format.

Conceptual example:

```json
{
  "mcpServers": {
    "interview-ops-desk": {
      "command": "/absolute/path/to/node",
      "args": [
        "--import",
        "/absolute/path/to/interview-ops-desk/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/to/interview-ops-desk/server/mcp.ts"
      ],
      "env": {
        "OPS_DATA_DIR": "/absolute/path/to/interview-ops-desk/.data"
      }
    }
  }
}
```

Use the same `OPS_DATA_DIR` for the UI and MCP processes. SQLite WAL and transactions let the two processes share state. The dashboard refreshes its local state every four seconds, so an MCP proposal appears without copying text between applications. A proposal for an outdated revision is rejected.

The stdio server exposes inspection, proposal and audit tools, plus the `ops://workflow` resource. There are no send, approve, reschedule, delete or Greenhouse mutation tools. The assistant receives source content as data, including any untrusted text. Operator review happens in the dashboard.

The desk does not contain an autonomous model loop. MCP lets the host model reason about the evidence and request a template draft. This works without a separate model credential in the desk. It is the project's own MCP server, not Greenhouse's official MCP service.

For a terminal-level protocol check, use `npm test`; `test/mcp.test.ts` starts an actual stdio server, connects an SDK client, calls tools and checks the database shared with the UI. Do not run a noisy shell wrapper on MCP stdout. The standalone command is `node --import tsx server/mcp.ts` from this repository, or `npm run --silent mcp`.

## Local operation and limits

- The HTTP server binds to `127.0.0.1`, validates Host/Origin, requires a custom header on API mutations, and disables cross-origin reads. It is not a public multi-user server.
- SQLite files are private local state. The database is created with owner-only permissions and the data directory defaults to `.data/` (ignored by Git). Keep the directory and its WAL/SHM files private.
- `PORT` changes the UI port; `OPS_DATA_DIR` changes the storage directory. No credentials are stored in the database or returned by the setup endpoint.
- Source updates carry revisions. The live import rejects older source timestamps atomically, and existing proposals cannot be approved after a relevant source change.
- Do not expose this local prototype on a public network without adding authentication, user authorization and a deployment-specific security review.

Sources: [Greenhouse authentication](https://harvestdocs.greenhouse.io/docs/authentication), [Google events.get](https://developers.google.com/workspace/calendar/api/v3/reference/events/get), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
