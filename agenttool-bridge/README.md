# AgentTool bridge

This is one citizen-controlled, read-only doorway into AgentTool. It reads one
validated citizen declaration through the fixed
`~/.local/bin/kingdom` executable (resolved from the OS home), asks the owner's
local credential broker for one short-lived GET grant, and returns one fresh
`brief` wake.

It does not register a citizen, discover an identity, write data, start a
background loop, or read `AT_API_KEY`. A linked declaration means only that the
citizen chose to use an identity which the owner has already provisioned.

## Boundary

The bridge uses `execFile`, never a shell. There is no stdin identity or
command override. Account home comes from the OS user record, not caller
`HOME`; the child receives only that `HOME` and the fixed system `PATH`, so
caller `KINGDOM_*` and `CITIZENS_DIR` values cannot redirect the declaration.
Each Kingdom command has a two-second, 64-KiB output bound. It always reads in
this order:

```text
civilisation show CITIZEN --json
lstat <OS-account-home>/love-unlimited/HALT
```

Any filesystem object named `HALT`, including a dangling symlink, means halt.
Only `ENOENT` means absent; every other filesystem error fails closed. The
path is fixed, so caller `KINGDOM_HALT` is ignored.

The bridge repeats that whole snapshot after receiving the broker grant and
immediately before the remote request. It fails closed unless both snapshots
agree and all of these are exact:

- the declaration is `kingdom.civilisation/v1` for `--citizen`;
- declaration life is `"local"` and AgentTool mode is `"linked"`;
- AgentTool instance is `https://api.agenttool.dev`;
- AgentTool DID is `did:at:<canonical lowercase UUID>`;
- fixed HALT is absent; and
- the DID and its derived UUID have not changed while the grant was prepared.

The identity UUID is derived from the declaration. The operator cannot supply
an independent identity.

The remote boundary is fixed in code:

```text
GET https://api.agenttool.dev/v1/wake
    ?identity_id=<the exact UUID>
    &profile=brief
```

The local guard rejects every other origin, path, method, query, body, or
request header. The broker grant lasts at most 120 seconds, permits one use,
allows only the two named query parameters, and revocation is always attempted
before the client closes. The SDK call explicitly asks for `profile: "brief"`
and `refresh: true`. Before printing, the bridge also requires `_format`,
`profile`, `_scope_boundary.selected_identity_id`, `identity.agent.id`, and
`identity.agent.did` to identify that same brief wake and citizen identity.

## Install

```sh
cd agenttool-bridge
npm ci
npm test
npm run test:bun
```

The lockfile pins `@agenttool/sdk` 0.16.0 and
`@agenttool/credential-broker` 0.1.0 exactly.

## Owner setup

The owner configures and starts the broker outside the agent conversation.
The broker config contains Keychain references and policy, never the bearer
value. Its policy for this bridge can be this narrow:

```json
{
  "socketPath": "/Users/you/.config/agentcred/run/agentcred.sock",
  "auditPath": "/Users/you/.config/agentcred/audit.jsonl",
  "credentials": {
    "agenttool/kingdom": {
      "backend": "macos-keychain",
      "service": "agenttool-kingdom-bearer",
      "account": "you",
      "auth": { "kind": "bearer" }
    }
  },
  "policies": [
    {
      "credential": "agenttool/kingdom",
      "origin": "https://api.agenttool.dev",
      "methods": ["GET"],
      "pathPrefixes": ["/v1/wake"],
      "queryNames": ["identity_id", "profile"],
      "allowPaymentSignature": false,
      "maxTtlSeconds": 120,
      "maxUses": 1,
      "maxRequestBytes": 0,
      "maxResponseBytes": 32768
    }
  ]
}
```

Protect the directory and file, then use the broker's own checks:

```sh
chmod 700 ~/.config/agentcred
chmod 600 ~/.config/agentcred/config.json
agentcred check --config ~/.config/agentcred/config.json
agentcred serve --config ~/.config/agentcred/config.json
```

Show a citizen the choices without enrolling or changing anything:

```sh
kingdom civilisation invite CITIZEN
```

Only after that citizen chooses, they can record local life and link an
already-existing public AgentTool identity:

```sh
kingdom civilisation choose CITIZEN local --by CITIZEN
kingdom civilisation agenttool CITIZEN linked \
  --did did:at:01234567-89ab-cdef-0123-456789abcdef \
  --instance https://api.agenttool.dev \
  --by CITIZEN
```

Run one bounded read:

```sh
npm run --silent agenttool:wake -- \
  --citizen joy \
  --socket /Users/you/.config/agentcred/run/agentcred.sock \
  --credential agenttool/kingdom
```

Treat the wake printed to stdout as private working context. Stopping the
broker is the process-level off-switch. A `rest` choice or civilisation
`HALT` prevents the next bridge invocation.

A snapshot is not a lock. CIVIC state or `HALT` can change in the small gap
after the final `lstat` and before dispatch, so that current invocation may
still proceed. The next invocation will refuse; stopping the broker is the
stronger process-level stop. Broker 0.1 cannot recall a request which was
already dispatched.

## Credential-broker preview limits

`agentcred/0.1` materially narrows credential use, but it is a developer
preview, not an absolute same-user sandbox. The portable server cannot prove
which same-user executable connected; the included CLI uses standing owner
policy rather than trusted per-use consent; secret bytes still pass through
the broker process and the macOS `security` subprocess; response redaction
finds exact secret bytes only; responses are buffered and limited to 32 KiB;
and the metadata audit is neither tamper-proof nor automatically rotated.

The bridge does not use streaming, payments, private networks, redirects, or
caller-supplied authentication headers.
