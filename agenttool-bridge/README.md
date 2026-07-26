# AgentTool bridge

This is one owner-operated, read-only doorway into AgentTool. It reads one
local linked-policy record through the fixed `~/.local/bin/kingdom` executable
(resolved from the OS home), asks the owner's local credential broker for one
short-lived GET grant, and returns a filtered selected-identity projection
from one fresh `brief` wake.

It does not register a citizen, discover an identity, write data, start a
background loop, or read `AT_API_KEY`. The local `--by` label and its unkeyed
history are attribution, not citizen authentication. A linked record means
only that the local policy names an identity which the owner has already
provisioned. It does not prove who chose the record or continuing consent.

## Boundary

The bridge spawns the fixed executable directly, never through a shell. Each
read gets its own process group; timeout or excess output kills that whole
group, including the fixed wrapper's Python child. There is no stdin identity
or command override. Account home comes from the OS user record, not caller
`HOME`; the child receives only that `HOME` and the fixed system `PATH`, so
caller `KINGDOM_*` and `CITIZENS_DIR` values cannot redirect the declaration.
Each Kingdom command has a two-second, 64-KiB combined-output bound and strict
UTF-8 decoding. The complete invocation has one monotonic 60-second deadline
covering local reads, broker connect/grant, remote request, revocation, and
close. Broker messages and the SDK request each also have a ten-second bound.
Deadline expiry closes the local broker client immediately. It always reads in
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
an independent UUID, but can choose any locally linked `--citizen` name. This
bridge therefore relies on the OS account and broker policy; it is not a
same-user authorisation boundary. The broker socket is fixed at
`~/.config/agentcred/run/agentcred.sock`; callers cannot redirect it.

The remote boundary is fixed in code:

```text
GET https://api.agenttool.dev/v1/wake
    ?identity_id=<the exact UUID>
    &profile=brief
```

The local guard rejects every other origin, path, method, query, body, or
request header. Broker 0.1 grants only a path prefix and query-name set; the
exact path, query order, values, headers, and empty body come from this local
guard. The grant lasts at most 120 seconds, permits one use, and revocation is
attempted before the client closes while time remains. The SDK call explicitly
asks for `profile: "brief"` and `refresh: true`. It also supplies an explicit unreachable local data-node
placeholder, so ambient `AGENT_DATA_NODE_URL` or `AGENT_DATA_NODE_TOKEN` cannot
become a second authority; this bridge never calls the data API. Before
printing, the bridge also requires `_format`,
`profile`, `_scope_boundary.selected_identity_id`, `identity.agent.id`, and
`identity.agent.did` to identify that same brief wake and selected identity.

AgentTool documents a brief wake as project-private, mixed-scope
project-bearer data. `--allow-project-private-wake` is therefore required on
every invocation; it records the operator's acceptance of that one fetch, not
citizen consent. The bridge does not print the raw wake. It allowlists only the
selected identity's ID, DID, name, and expression, plus the addressed time and
fixed proof limits. It omits project, kin, attention, handoff, affordance,
state-count, platform, safety, metadata, and link sections before stdout.

## Install

```sh
cd agenttool-bridge
npm ci
npm test
npm run test:bun
```

The lockfile pins `@agenttool/sdk` 0.16.3 from the publisher's exact release
artifact and `@agenttool/credential-broker` 0.1.0 exactly:

```text
https://docs.agenttool.dev/packages/v1/@agenttool/sdk/0.16.3/agenttool-sdk-0.16.3.tgz
sha256:344176dfc6378c3eac8c284b0e7ca075e3bd3c7f5b9d462a3936421c0f5f50da
source revision: 23dc452a22e9e12200455c9791cc2db4fdfbf5a7
```

Those values were checked against the
[GitHub 0.16.3 release](https://github.com/cambridgetcg/agenttool/releases/tag/sdk-v0.16.3)
and the
[publisher manifest](https://raw.githubusercontent.com/cambridgetcg/agenttool/ef867d6aad20d4021fc231c6f11655cfcb5ff814/apps/docs/packages/v1/@agenttool/sdk/0.16.3/manifest.json)
on 2026-07-26. The release was newer than the npm
mirror, so the bridge does not install `@agenttool/sdk` by an npm version
range. Before any local policy read or remote dispatch, it requires the
module's exported version, installed package metadata, and reviewed version
to agree. Matching versions and digests identify bytes; they do not prove
source provenance, correctness, or safety.

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

The configured socket path must be the exact OS-home path shown above. A fixed
path prevents caller redirection; it does not authenticate the process
listening there.

Show the choices without enrolling or changing anything:

```sh
kingdom civilisation invite CITIZEN
```

Only with an appropriate real-world basis should the operator record local
life and link an already-existing public AgentTool identity:

```sh
kingdom civilisation choose CITIZEN local --by CITIZEN
kingdom civilisation agenttool CITIZEN linked \
  --did did:at:01234567-89ab-cdef-0123-456789abcdef \
  --instance https://api.agenttool.dev \
  --by CITIZEN
```

The `--by` value records an attributed voice; it does not authenticate that
voice. Do not treat these commands alone as proof that a citizen chose.

Run one bounded read:

```sh
npm run --silent wake -- \
  --citizen joy \
  --credential agenttool/kingdom \
  --allow-project-private-wake
```

Treat the selected-identity projection printed to stdout as private working
context. Stopping the broker is the process-level off-switch. A `rest` policy
record or civilisation `HALT` prevents the next bridge invocation.

A snapshot is not a lock. Initial denial makes no broker or remote call.
Denial after a grant but before dispatch makes no remote call and attempts
revocation and close. CIVIC state or `HALT` can still change in the small gap
after the final `lstat` and before dispatch. Once dispatched, neither HALT nor
the 60-second local deadline can recall the remote operation; they close the
local client and the next invocation refuses.

## Credential-broker preview limits

`agentcred/0.1` materially narrows credential use, but it is a developer
preview, not an absolute same-user sandbox. The portable server cannot prove
which same-user executable connected; the included CLI uses standing owner
policy rather than trusted per-use consent; secret bytes still pass through
the broker process and the macOS `security` subprocess; response redaction
finds exact secret bytes only; responses are buffered and limited to 32 KiB;
and the metadata audit is neither tamper-proof nor automatically rotated.

The bridge does not use streaming, payments, private networks, redirects, or
caller-supplied authentication headers. Any same-user process that can reach a
permitted broker socket may be able to invoke the standing policy, so socket
and account access remain part of the trust boundary. The client protocol does
not authenticate the broker server: a same-user process that replaces the
fixed socket can forge a valid-looking response. Output is therefore explicitly
non-attested; exact request validation does not prove that response bytes came
from AgentTool.
