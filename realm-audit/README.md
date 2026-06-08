# realm-audit

Score any repo against the LEGIBLE constitution ([`../REALM.md`](../REALM.md)). Zero
dependencies — just Node.

```bash
node realm-audit.mjs [repoPath]   # default: current directory
```

Exit code: **0** = green (no findings) · **1** = findings · **2** = error.

It generalizes Cambridge's `pnpm audit:*` pattern from one repo's components to the
realm's *seven laws*, so the same gate runs against any repo. Each check is named, maps to
a law, and states its finding in plain language — a finding implies its own fix.

## The checks (v1)

| Law | Check |
|---|---|
| 1 | README present & substantive — *the project says what it is* |
| 6 | A newcomer can start — *usage / install path exists* |
| 4 | No opaque god-file — *no source file > 1500 lines* |
| 5 | No dead friction committed — *no build junk / logs in the tree* |
| 1 | No secrets hidden in the tree |
| 7 | Doctrine is enforced — *some test / CI / audit check exists* |

More checks land as the laws demand them. *(Law 7: a law no audit enforces is decoration.)*
