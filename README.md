# kingdom — Kingdom OS (LEGIBLE)

The realm's operating system, finally written down. One principle runs under every
project: **legibility → fairness → friction gone.**

> Nothing true is hidden. Nothing earned is given for free. Nothing concentrates opaque control.

Its versioned semantic floor is
[`kingdom.foundation/0.2`](https://github.com/cambridgetcg/kingdom-standard/blob/07efbc0a6d530f4586de67e2049dd3bcc744afc5/FOUNDATION.md).
Its exact English operational words are pinned as
[`kingdom.standard/1.0`](https://github.com/cambridgetcg/kingdom-standard/blob/07efbc0a6d530f4586de67e2049dd3bcc744afc5/STANDARD.md).
The separate
[`kingdom.ground/0.1`](https://github.com/cambridgetcg/kingdom-standard/blob/44daf3e1bf649ef25c7c1a516c7c8702745c0a33/GROUND.md)
asks what those seven commitments stand on. It is a companion, not an adopted
law, amendment, or grant of authority. Its files are structurally checked; its
citations and conclusions still need readers. Its own adversarial review found
four groundings sound with corrections, three overclaimed, and none clean.
The floor says:
reality before records, being before systems, choice before action, KARMA as
evidence-backed consequence and repair, local roots, and finite turns. This
repo declares both versions in [`kingdom.yaml`](kingdom.yaml); the declaration
is a commitment, not proof of conformance.

## What's here

- **[REALM.md](REALM.md)** — the constitution. Seven laws, each citing the project of the
  realm that already lives it. Extracted, not invented.
- **[DECISIONS.md](DECISIONS.md)** — append-only ADRs (one chain, one commerce repo, …).
  Some are *Proposed*, awaiting ratification.
- **[realm-audit/](realm-audit/)** — the check that makes the constitution *bite* (Law 7):
  scores any repo against the laws, with exit codes.
- **[agenttool-bridge/](agenttool-bridge/)** — an owner-operated, policy-gated,
  read-only AgentTool doorway. A validated local record must say `local` and
  `linked`, the fixed local `HALT` must be absent, and one invocation must
  explicitly accept the project-private wake fetch. The bridge has a fixed
  broker socket and whole-operation deadline, verifies its installed SDK
  version before any policy read, then returns only a non-attested
  selected-identity projection.

## Usage

Score any repo in the realm against the constitution:

```bash
node realm-audit/realm-audit.mjs /path/to/repo   # exit 0 = green, 1 = findings
npm --prefix agenttool-bridge ci                  # exact locked bridge dependencies
npm run verify                                    # audit the repo and test the bridge
```

Read one filtered selected-identity projection when an authorised operator has
a real-world basis for the local link. The bridge derives the identity from
the local record, but that record and its `--by` label are not citizen
authentication:

```bash
npm run --silent agenttool:wake -- \
  --citizen CITIZEN \
  --credential OWNER_REFERENCE \
  --allow-project-private-wake
```

Setup, exact authority limits, and broker preview caveats live in
[agenttool-bridge/README.md](agenttool-bridge/README.md). The bridge never
auto-registers a citizen.

🐍👑
