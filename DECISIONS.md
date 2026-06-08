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

*Append the next decision below. Ratify a Proposed record by changing its status to
`Accepted` (and dating it); never rewrite an Accepted one.*
