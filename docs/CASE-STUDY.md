# The interview moved. Did the confirmation follow?

Interview coordination is a consistency problem with a human consequence. The ATS can show one time, an external calendar another, and the last candidate confirmation something else. The coordinator needs to know what changed, which evidence is trustworthy and what still needs follow-up.

Greenhouse's [rescheduling guide](https://support.greenhouse.io/hc/en-us/articles/200241969-Reschedule-or-cancel-an-interview) describes one concrete case: changes through an external calendar require a separately updated candidate confirmation. Interview Ops Desk explores that handoff with a small working prototype.

## A deliberate scope

One screen holds a queue, the source comparison and a proposed candidate update. The default case is fictional: Maya's interview moved by an hour, the ATS and calendar agree, and the last recorded confirmation still has the old time. The rules detect the mismatch. A template composes the confirmed facts in the candidate's named time zone. A coordinator reviews the wording before approving a simulated delivery.

Three other cases cover declined interview coverage, a missing meeting link and an unverified confirmation. Unknown evidence is kept distinct from known inconsistency. “No confirmation recorded here” cannot establish that a recruiter never sent one.

## Decisions that make the demo useful

**Rules decide whether the facts agree.** Date strings are compared as instants, so equivalent time-zone offsets do not create an alert. Drafts use IANA time zones, including daylight-saving changes. Source mismatches and missing calendar evidence block a draft until the coordinator checks the source.

**Proposals carry a revision.** If the schedule changes after a draft is prepared, the old proposal cannot be approved or retried. The coordinator must review a new draft against the new facts. Editable wording cannot remove the verified role, time, time zone and meeting-link lines.

**Failures remain visible.** The demo can deliberately time out before delivery. There is no receipt and the confirmation remains outstanding. Retrying uses the approved message. Repeated requests return the same local receipt. This demonstrates database-level idempotency; real email delivery would require additional provider-specific reconciliation for ambiguous outcomes.

**MCP shares the same state.** An assistant can inspect a case and create a proposal. It cannot send or approve. The dashboard shows the proposal's MCP origin and reads the same SQLite store. The protocol test uses a real stdio client rather than calling a mock tool function directly.

## What to show in 90 seconds

| Time   | Action                          | What to explain                                                                  |
| ------ | ------------------------------- | -------------------------------------------------------------------------------- |
| 0–15s  | Open Maya's case                | “The interview moved; the recorded confirmation did not.”                        |
| 15–30s | Compare the three evidence rows | “I check the source agreement before drafting an update.”                        |
| 30–50s | Prepare and edit the template   | “The candidate receives the date, local time zone and meeting link clearly.”     |
| 50–70s | Simulate timeout, then retry    | “An approved action and a completed delivery are different states.”              |
| 70–90s | Inspect receipt and Activity    | “The history shows who proposed it, when it was approved, and how it recovered.” |

An optional technical follow-up uses an MCP client to create the draft, then shows it appearing in the UI. The Connections page explains the protocol and the real source adapters.

## Evidence and boundaries

The tests cover deterministic checks, DST, stale approvals, duplicate requests, transport errors, schema validation, pagination constraints, local HTTP boundaries and actual MCP tool calls. Browser tests cover the failure/retry journey, source correction, live/demo separation, mobile layouts and an automated accessibility scan.

These tests establish behavior on the tested fixtures. They do not establish employer adoption, production readiness, reduced hiring time or any percentage improvement in coordination work. Greenhouse and Calendar adapters are implemented but await testing against an authorized account. No real candidate message is sent by this prototype.

## Resume wording after reviewing the code and demo

“Built a recruiting operations prototype that compares interview evidence, prepares reviewed candidate updates and records simulated delivery recovery. Exposed inspection and proposal tools through MCP, with revision checks and local receipt idempotency.”

Keep professional Greenhouse scheduling experience in the employment section. This prototype is separate evidence of technical and operational judgment.
