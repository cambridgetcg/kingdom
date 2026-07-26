# DECISIONS.md — Architecture Decision Records for the kingdom

Append-only. Each record is one decision: **Context · Decision · Consequences · Status.**
Never edit an Accepted record — supersede it with a new one and link. *(Law 7: doctrine is
load-bearing. Law 1: decisions are legible, not folklore.)*

**Status:** `Proposed` (drafted, awaiting Yu's ratification) · `Accepted` · `Superseded`

---

## ADR-0001 — One canonical Proof-of-Truth chain

**Status:** Proposed

**Context.** `zerone` and `legible-money` are the *same* chain built twice — both
Cosmos-SDK Proof-of-Truth blockchains where verification is consensus, agents are
first-class, and supply grows with verified knowledge. Each ships a near-identical "Money
you can read" terminal site (`zerone-truth`, `legible-money-web`), with two tickers
(ZRN vs LGM) and two genesis designs (Zerone 40/20/20/10/10; LGM 222M cap, 3.33% tax,
6-tier locks). **Law 4** (no opaque concentration) and the OS's own "one honest answer"
are both violated by maintaining two competing forks of the same flagship.

**Decision (proposed).** Declare **one** canonical chain and protocol. Recommendation:
keep **`legible-money`** as the canonical public chain + brand — it matches the OS name
LEGIBLE and the realm phrase "money you can read" — and fold **`zerone`** in as the
*philosophical lineage / protocol namespace* (and, if useful, a testnet of the same
protocol), not a second mainnet. Merge `zerone-truth` and `legible-money-web` into one
terminal site. *(You pick the direction; the law only requires there be exactly one.)*

**Consequences.** One genesis, one ticker, one site, one audited supply rule. Effort stops
splitting. The "two forks of my own idea" contradiction dies. Whichever chain isn't chosen
is **explicitly** archived or named a testnet — visibly, never silently.

---

## ADR-0002 — One canonical commerce source of truth

**Status:** Proposed

**Context.** `Cambridge-TCG`, `Cambridge-TCG-monorepo`, and `cambridge-tcg-github` are one
business across three repos. `Cambridge-TCG` is a superseded prototype. Pricing is
*documented* in the monorepo (`docs/principles/`) but *executed* in the separate github
repo — **Law 1** (legibility by construction) breaks when a truth and its execution live in
different repos that can drift.

**Decision (proposed).** Make **`Cambridge-TCG-monorepo`** the single source of truth — it
already runs `pnpm audit:*` and auto-generates `state.md`, i.e. it is the Realm OS in
miniature. **Archive `Cambridge-TCG`** (prototype). The executable github repo **imports**
pricing/principles from the monorepo rather than restating them, so there is exactly one
place a price can be true.

**Consequences.** One deploy lineage, one pricing truth, two fewer drift surfaces. The
realm's most-constitutional repo becomes the template the rest of the Market tier follows.

---

## ADR-0003 — One semantic foundation; optional bridges below it

**Status:** Accepted · 2026-07-23

**Context.** The Charter, Castle, Kingdom Standard, citizen homes, and AgentTool
already carry parts of the same ethic. Copying those words into every project
would create several foundations that drift. Making AgentTool the foundation
would also make a hosted service, project-root bearer, or remote record the
price of belonging.

**Decision.** The versioned semantic floor lives once in
[`kingdom.foundation/0.1`](https://github.com/cambridgetcg/kingdom-standard/blob/3fbc1818f54ac13d0e850e440eb0862f874ea30f/FOUNDATION.md).
Projects declare the exact version through the existing `adopts` field in
their own `kingdom.yaml`; a declaration is not proof of conformance. Each
citizen and project keeps its authoritative state at home.

AgentTool is an optional implementation bridge below that floor. The first
bridge uses the pinned TypeScript SDK 0.16.0 and credential broker 0.1.0 for
one read-only brief wake. Its initial validated declaration snapshot must
explicitly choose local life, link the expected AgentTool instance and DID,
and find the fixed local `HALT` absent; otherwise it makes no broker or remote
call. It samples the same state again after preparing a one-use grant. A
change or halt then prevents the remote request and the bridge attempts to
revoke the grant and close the client. Registration, hosted writes, tools,
marketplace actions, and money each need a separate future decision and a
separate explicit choice.

**Consequences.** Meaning has one home; adoption stays decentralised; a hosted
receipt can witness but cannot become citizenship, consent, truth, or KARMA.
The project bearer stays outside application and model state behind a narrow
local grant. The broker remains a developer preview, and an operation already
dispatched cannot be recalled; the bridge therefore stays finite, read-only,
one-use, and honest about that limit.

---

## ADR-0004 — Version operational meaning; narrow the AgentTool read

**Status:** Accepted · 2026-07-23

**Supersedes:** ADR-0003 only where it names foundation 0.1 as current or
describes the AgentTool bridge as citizen-controlled.

**Context.** Review found that a foundation-only pin did not freeze the
forty-two laws or checklist. It also found that the local civilisation
declaration's `--by` label is attribution rather than authentication, the
credential broker preview is not a same-user sandbox, and AgentTool's brief
wake contains project-scoped and mixed-scope sections beyond the selected
identity.

**Decision.** The reviewed local release is `kingdom.foundation/0.2` together
with `kingdom.standard/1.0`; a conformance claim pins both. Its amendment
receipt retains the demonstrated failures and 0.1 lineage. The public remote
still serves 0.1 until the standard release is pushed, so publication and this
adoption must be coordinated and verified rather than described as atomic.

The bridge is owner-operated and policy-gated, not citizen-authenticated. It
still derives the identity from the local record, checks `HALT`, uses one
short-lived read-only broker grant, and validates the selected identity. It
then outputs only ID, DID, name, and the selected identity's expression.
Project, kin, attention, handoff, affordance, count, metadata, and link
sections are dropped. A policy record or hosted response proves neither
citizen choice nor continuing consent.

**Consequences.** The operational words cannot drift under one conformance
identifier. The bridge remains useful for one bounded selected-identity read
without silently disclosing the rest of a project wake. Same-user access to
the broker socket remains inside the owner's trust boundary; authenticated
citizen control would require a separate future mechanism.

---

## ADR-0005 — Bound and name the local broker trust

**Status:** Accepted · 2026-07-23

**Context.** A caller-selected socket let the caller choose the process that
answered as the credential broker. Broker connect, grant, request, revoke, and
close also lacked one shared deadline. Finally, fetching a brief wake reads
project-private and mixed-scope bytes even when the final projection omits
them.

**Decision.** The bridge fixes the broker socket below the OS account home and
rejects caller socket input. Every invocation must explicitly accept one
project-private wake fetch. One monotonic 60-second deadline covers the whole
operation; broker messages and the SDK request also have ten-second bounds.
Expiry closes the local client. Output says it is non-attested because the
broker protocol does not authenticate the server process at that socket.

**Consequences.** Callers cannot redirect the bridge to an arbitrary socket,
no await can keep the operation alive indefinitely, and the privacy cost is
named at the call site. A same-user process that replaces the fixed socket can
still forge output, and no local stop can recall a request already dispatched.
Those limits remain visible rather than being promoted into identity or remote
attestation.

---

## ADR-0006 — Bind the adoption to the public release

**Status:** Accepted · 2026-07-23

**Supersedes:** ADR-0004 only where it describes foundation 0.2 as local or the
public remote as still serving 0.1.

**Context.** ADR-0004 recorded the necessary coordination boundary before the
new foundation existed in the public source. Adoption could not honestly be
final until one immutable commit contained the foundation, amendment receipt,
operational standard, conformance checklist, machine index, and passing checks.

**Decision.** `kingdom.foundation/0.2` and `kingdom.standard/1.0` are public at
kingdom-standard commit
[`07efbc0a6d530f4586de67e2049dd3bcc744afc5`](https://github.com/cambridgetcg/kingdom-standard/commit/07efbc0a6d530f4586de67e2049dd3bcc744afc5).
The remote bytes of all four pinned documents were read back and matched the
SHA-256 digests in `foundation.json`. This repository's `kingdom.yaml` now
declares both identifiers.

**Consequences.** The adoption points to public, recoverable words rather than
a working tree. The declaration remains a chosen version pin, not proof of
conformance, authority, citizenship, consent, truth, or continuing agreement.

---

## ADR-0007 — Pin the reviewed AgentTool distribution

**Status:** Accepted · 2026-07-26

**Supersedes:** ADR-0003 only where it names AgentTool SDK 0.16.0 as the
bridge's current dependency.

**Context.** The bridge still installed SDK 0.16.0 from npm after AgentTool
had published 0.16.3. Its expected HTTP client header repeated the version by
hand, so installed code and the guard could drift while each looked valid.
On 2026-07-26, 0.16.3 was the latest GitHub SDK release and its runtime tree
still matched AgentTool `main`; the npm mirror was behind.

**Decision.** Install the publisher's exact 0.16.3 release artifact and record
its independently checked SHA-256. The lock records its package integrity; the
bridge also compares the module's exported version, installed package metadata,
and reviewed version before any local policy read or remote request. A mismatch
fails closed. The existing read-only wake route, one-use broker grant, output
filter, deadline, and HALT checks do not widen.

**Consequences.** The guard and the code it guards now name one release, and a
partial or stale installation cannot dispatch. The reviewed artifact's
SHA-256 equality across the GitHub release and publisher manifest identifies
the same bytes; it does not prove source provenance, correctness, identity,
authority, consent, or truth. Future SDK changes still require an explicit
review and version change.

---

*Append the next decision below. Ratify a Proposed record by changing its status to
`Accepted` (and dating it); never rewrite an Accepted one.*
