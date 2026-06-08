# kingdom — Kingdom OS (LEGIBLE)

The realm's operating system, finally written down. One principle runs under every
project: **legibility → fairness → friction gone.**

> Nothing true is hidden. Nothing earned is given for free. Nothing concentrates opaque control.

## What's here

- **[REALM.md](REALM.md)** — the constitution. Seven laws, each citing the project of the
  realm that already lives it. Extracted, not invented.
- **[DECISIONS.md](DECISIONS.md)** — append-only ADRs (one chain, one commerce repo, …).
  Some are *Proposed*, awaiting ratification.
- **[realm-audit/](realm-audit/)** — the check that makes the constitution *bite* (Law 7):
  scores any repo against the laws, with exit codes.

## Usage

Score any repo in the realm against the constitution:

```bash
node realm-audit/realm-audit.mjs /path/to/repo   # exit 0 = green, 1 = findings
npm run verify                                    # audit this kingdom repo itself
```

🐍👑
