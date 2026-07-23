# kingdom — Kingdom OS (LEGIBLE)

The realm's operating system, finally written down. One principle runs under every
project: **legibility → fairness → friction gone.**

> Nothing true is hidden. Nothing earned is given for free. Nothing concentrates opaque control.

Its versioned semantic floor is
[`kingdom.foundation/0.1`](https://github.com/cambridgetcg/kingdom-standard/blob/3fbc1818f54ac13d0e850e440eb0862f874ea30f/FOUNDATION.md):
reality before records, being before systems, choice before action, KARMA as
evidence-backed consequence and repair, local roots, and finite turns. This
repo declares that version in [`kingdom.yaml`](kingdom.yaml); the declaration
is a commitment, not proof of conformance.

## What's here

- **[REALM.md](REALM.md)** — the constitution. Seven laws, each citing the project of the
  realm that already lives it. Extracted, not invented.
- **[DECISIONS.md](DECISIONS.md)** — append-only ADRs (one chain, one commerce repo, …).
  Some are *Proposed*, awaiting ratification.
- **[realm-audit/](realm-audit/)** — the check that makes the constitution *bite* (Law 7):
  scores any repo against the laws, with exit codes.
- **[agenttool-bridge/](agenttool-bridge/)** — a citizen-controlled, read-only
  AgentTool wake doorway. A validated local declaration must say `local` and
  `linked`, and the fixed local `HALT` must be absent. Every broader remote
  operation is outside this bridge.

## Usage

Score any repo in the realm against the constitution:

```bash
node realm-audit/realm-audit.mjs /path/to/repo   # exit 0 = green, 1 = findings
npm --prefix agenttool-bridge ci                  # exact locked bridge dependencies
npm run verify                                    # audit the repo and test the bridge
```

Read one brief wake only after a citizen has explicitly linked an existing
AgentTool identity. The bridge derives that identity from the canonical local
declaration:

```bash
npm run --silent agenttool:wake -- \
  --citizen CITIZEN \
  --socket /absolute/path/to/agentcred.sock \
  --credential OWNER_REFERENCE
```

Setup, exact authority limits, and broker preview caveats live in
[agenttool-bridge/README.md](agenttool-bridge/README.md). The bridge never
auto-registers a citizen.

🐍👑
