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

*Append the next decision below. Ratify a Proposed record by changing its status to
`Accepted` (and dating it); never rewrite an Accepted one.*
