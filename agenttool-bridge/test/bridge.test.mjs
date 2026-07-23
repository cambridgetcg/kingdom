import assert from "node:assert/strict";
import test from "node:test";

import { PolicyConsent } from "@agenttool/credential-broker";

import {
  AGENTTOOL_ORIGIN,
  BridgeError,
  buildGrantRequest,
  fetchCitizenWake,
  guardWakeTransport,
  KINGDOM_COMMAND_TIMEOUT_MS,
  KINGDOM_COMMAND_ENV,
  KINGDOM_EXECUTABLE,
  KINGDOM_HALT_PATH,
  MAX_KINGDOM_OUTPUT_BYTES,
  parseKingdomJson,
  validateCanonicalIdentityId,
  validateWakeIdentity,
} from "../bridge.mjs";
import { parseArgs } from "../cli.mjs";

const IDENTITY_ID = "01234567-89ab-cdef-0123-456789abcdef";
const DID = `did:at:${IDENTITY_ID}`;
const SHOW = Object.freeze({
  schema: "kingdom.civilisation/v1",
  citizen: "joy",
  life: { mode: "local" },
  agenttool: {
    mode: "linked",
    did: DID,
    instance: AGENTTOOL_ORIGIN,
  },
  history: [],
});
const WAKE = Object.freeze({
  _format: "wake-brief/v1",
  profile: "brief",
  _scope_boundary: { selected_identity_id: IDENTITY_ID },
  identity: { agent: { id: IDENTITY_ID, did: DID, name: "joy" } },
});

function fakeCommands(options = {}) {
  const calls = [];
  let showRead = 0;
  const shows = options.shows ?? [options.show ?? SHOW, options.show ?? SHOW];
  const reader = async (executable, args, limits) => {
    options.events?.push("show");
    calls.push({
      executable,
      args: [...args],
      limits: { ...limits, env: { ...limits.env } },
    });
    assert.deepEqual(args.slice(0, 2), ["civilisation", "show"]);
    const value = shows[Math.min(showRead, shows.length - 1)];
    showRead += 1;
    return JSON.stringify(value);
  };
  return { calls, reader };
}

function missingError() {
  return Object.assign(new Error("not found"), { code: "ENOENT" });
}

function fakeHalts(states = [false, false], events) {
  const calls = [];
  let read = 0;
  const reader = async (path) => {
    events?.push("halt");
    calls.push(path);
    const state = states[Math.min(read, states.length - 1)];
    read += 1;
    if (state instanceof Error) throw state;
    if (state === true) return;
    throw missingError();
  };
  return { calls, reader };
}

function fakeBroker(options = {}) {
  const events = [];
  const requests = [];
  let grantRequest;
  const grant = Object.freeze({ opaque: true });
  const broker = {
    events,
    requests,
    get grantRequest() {
      return grantRequest;
    },
    async connect() {
      events.push("connect");
      if (options.connectError) throw options.connectError;
    },
    async requestGrant(request) {
      events.push("grant");
      grantRequest = structuredClone(request);
      if (options.grantError) throw options.grantError;
      return grant;
    },
    asTransport(actualGrant) {
      assert.equal(actualGrant, grant);
      events.push("transport");
      return {
        async request(input, init) {
          events.push("request");
          const request = new Request(input, init);
          requests.push(request);
          if (options.requestError) throw options.requestError;
          return new Response(JSON.stringify(options.wake ?? WAKE), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-wake-profile": "brief",
            },
          });
        },
      };
    },
    async revoke(actualGrant) {
      assert.equal(actualGrant, grant);
      events.push("revoke");
      if (options.revokeError) throw options.revokeError;
    },
    async close() {
      events.push("close");
      if (options.closeError) throw options.closeError;
    },
  };
  return broker;
}

function validOptions() {
  return {
    citizen: "joy",
    socketPath: "/tmp/agentcred-test.sock",
    credential: "agenttool/kingdom",
  };
}

test("fixed Kingdom reads derive identity, then one exact SDK wake cleans up", async () => {
  const originalFetch = globalThis.fetch;
  const originalAmbient = process.env.AT_API_KEY;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("global network must not be used");
  };
  process.env.AT_API_KEY = "ambient-value-must-be-ignored";

  const civicOrder = [];
  const commands = fakeCommands({ events: civicOrder });
  const halts = fakeHalts([false, false], civicOrder);
  const broker = fakeBroker();
  try {
    const wake = await fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory(clientOptions) {
        assert.deepEqual(clientOptions, {
          socketPath: "/tmp/agentcred-test.sock",
          clientName: "kingdom-agenttool-bridge/1",
        });
        return broker;
      },
    });

    assert.equal(wake.identity.agent.name, "joy");
    assert.equal(networkCalls, 0);
    assert.deepEqual(
      commands.calls,
      [
        ["show", ["civilisation", "show", "joy", "--json"]],
        ["pre-dispatch show", ["civilisation", "show", "joy", "--json"]],
      ].map(([, args]) => ({
        executable: KINGDOM_EXECUTABLE,
        args,
        limits: {
          timeoutMs: KINGDOM_COMMAND_TIMEOUT_MS,
          maxOutputBytes: MAX_KINGDOM_OUTPUT_BYTES,
          env: { ...KINGDOM_COMMAND_ENV },
        },
      })),
    );
    assert.deepEqual(halts.calls, [KINGDOM_HALT_PATH, KINGDOM_HALT_PATH]);
    assert.deepEqual(civicOrder, ["show", "halt", "show", "halt"]);
    assert.deepEqual(Object.keys(commands.calls[0].limits.env).sort(), ["HOME", "PATH"]);
    assert.equal("KINGDOM_HALT" in commands.calls[0].limits.env, false);
    assert.equal("KINGDOM_CITIZENS_ROOT" in commands.calls[0].limits.env, false);
    assert.equal("CITIZENS_DIR" in commands.calls[0].limits.env, false);
    assert.deepEqual(broker.events, [
      "connect",
      "grant",
      "transport",
      "request",
      "revoke",
      "close",
    ]);
    assert.equal(broker.requests.length, 1);
    const request = broker.requests[0];
    assert.equal(
      request.url,
      `${AGENTTOOL_ORIGIN}/v1/wake?identity_id=${IDENTITY_ID}&profile=brief`,
    );
    assert.equal(request.method, "GET");
    assert.equal(request.body, null);
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("x-agenttool-client"), "agenttool-sdk-ts/0.16.0");
    assert.equal(
      [...request.headers.values()].includes("ambient-value-must-be-ignored"),
      false,
    );
    assert.deepEqual(broker.grantRequest, {
      alias: "kingdom-wake",
      credential: "agenttool/kingdom",
      operation: "http.fetch",
      scope: {
        origin: AGENTTOOL_ORIGIN,
        methods: ["GET"],
        pathPrefixes: ["/v1/wake"],
        queryNames: ["identity_id", "profile"],
        ttlSeconds: 120,
        maxUses: 1,
        maxRequestBytes: 0,
        maxResponseBytes: 32768,
      },
      rationale: "Read one fresh brief wake after an explicit local linked citizen snapshot.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAmbient === undefined) delete process.env.AT_API_KEY;
    else process.env.AT_API_KEY = originalAmbient;
  }
});

test("HALT appearing after the grant prevents dispatch and still cleans up", async () => {
  const order = [];
  const commands = fakeCommands({ events: order });
  const halts = fakeHalts([false, true], order);
  const broker = fakeBroker();
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory: () => broker,
    }),
    /HALT is present/,
  );
  assert.equal(broker.requests.length, 0);
  assert.deepEqual(broker.events, ["connect", "grant", "transport", "revoke", "close"]);
  assert.equal(commands.calls.length, 2);
  assert.deepEqual(order, ["show", "halt", "show", "halt"]);
});

test("identity change after the grant prevents dispatch and still cleans up", async () => {
  const changedId = "11234567-89ab-cdef-0123-456789abcdef";
  const changedShow = {
    ...SHOW,
    agenttool: { ...SHOW.agenttool, did: `did:at:${changedId}` },
  };
  const commands = fakeCommands({ shows: [SHOW, changedShow] });
  const halts = fakeHalts();
  const broker = fakeBroker();
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory: () => broker,
    }),
    /identity changed/,
  );
  assert.equal(broker.requests.length, 0);
  assert.deepEqual(broker.events, ["connect", "grant", "transport", "revoke", "close"]);
  assert.equal(commands.calls.length, 2);
});

test("invalid DID and wrong instance fail before broker creation", async () => {
  const cases = [
    { ...SHOW, agenttool: { ...SHOW.agenttool, did: "did:at:NOT-A-UUID" } },
    { ...SHOW, agenttool: { ...SHOW.agenttool, did: `did:at:${IDENTITY_ID.toUpperCase()}` } },
    { ...SHOW, agenttool: { ...SHOW.agenttool, instance: "https://other.example" } },
  ];
  for (const show of cases) {
    const commands = fakeCommands({ show });
    const halts = fakeHalts([false]);
    let factories = 0;
    await assert.rejects(
      fetchCitizenWake(validOptions(), {
        commandReader: commands.reader,
        haltReader: halts.reader,
        brokerFactory() {
          factories += 1;
          return fakeBroker();
        },
      }),
      BridgeError,
    );
    assert.equal(factories, 0);
    assert.equal(commands.calls.length, 1);
    assert.deepEqual(halts.calls, [KINGDOM_HALT_PATH]);
  }
});

test("initial rest, off, unasked, invalid, and HALT make no broker calls", async () => {
  const cases = [
    [{ ...SHOW, life: { mode: "rest" } }, false],
    [{ ...SHOW, agenttool: { ...SHOW.agenttool, mode: "off" } }, false],
    [{ ...SHOW, life: { mode: "unasked" }, agenttool: { mode: "unasked" } }, false],
    [{ ...SHOW, citizen: "peace" }, false],
    [SHOW, true],
  ];
  for (const [show, halted] of cases) {
    const commands = fakeCommands({ show });
    const halts = fakeHalts([halted]);
    let factories = 0;
    await assert.rejects(
      fetchCitizenWake(validOptions(), {
        commandReader: commands.reader,
        haltReader: halts.reader,
        brokerFactory() {
          factories += 1;
          return fakeBroker();
        },
      }),
      BridgeError,
    );
    assert.equal(factories, 0);
  }
});

test("HALT filesystem errors other than ENOENT fail closed before broker creation", async () => {
  const commands = fakeCommands();
  const failure = Object.assign(new Error("permission denied"), { code: "EACCES" });
  const halts = fakeHalts([failure]);
  let factories = 0;
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory() {
        factories += 1;
        return fakeBroker();
      },
    }),
    /HALT check failed/,
  );
  assert.equal(factories, 0);
});

test("mismatched or non-brief wake identity is refused after cleanup", async () => {
  const wrong = [
    { ...WAKE, _format: "wake/v1" },
    { ...WAKE, profile: "full" },
    { ...WAKE, _scope_boundary: { selected_identity_id: "11234567-89ab-cdef-0123-456789abcdef" } },
    { ...WAKE, identity: { agent: { ...WAKE.identity.agent, id: "11234567-89ab-cdef-0123-456789abcdef" } } },
    { ...WAKE, identity: { agent: { ...WAKE.identity.agent, did: "did:at:11234567-89ab-cdef-0123-456789abcdef" } } },
  ];
  for (const wake of wrong) {
    const commands = fakeCommands();
    const halts = fakeHalts();
    const broker = fakeBroker({ wake });
    await assert.rejects(
      fetchCitizenWake(validOptions(), {
        commandReader: commands.reader,
        haltReader: halts.reader,
        brokerFactory: () => broker,
      }),
      BridgeError,
    );
    assert.equal(broker.requests.length, 1);
    assert.deepEqual(broker.events.slice(-2), ["revoke", "close"]);
  }
});

test("remote failure still revokes and closes", async () => {
  const commands = fakeCommands();
  const halts = fakeHalts();
  const broker = fakeBroker({ requestError: new Error("synthetic upstream failure") });
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory: () => broker,
    }),
    /synthetic upstream failure/,
  );
  assert.deepEqual(broker.events.slice(-2), ["revoke", "close"]);
});

test("cleanup failures are reported and close follows revoke", async () => {
  const commands = fakeCommands();
  const halts = fakeHalts();
  const broker = fakeBroker({
    revokeError: new Error("synthetic revoke failure"),
    closeError: new Error("synthetic close failure"),
  });
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      commandReader: commands.reader,
      haltReader: halts.reader,
      brokerFactory: () => broker,
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      return true;
    },
  );
  assert.deepEqual(broker.events.slice(-2), ["revoke", "close"]);
});

test("the local transport guard refuses every target change before forwarding", async () => {
  let forwards = 0;
  const guarded = guardWakeTransport(
    {
      async request() {
        forwards += 1;
        return new Response("{}");
      },
    },
    IDENTITY_ID,
  );
  const headers = {
    "content-type": "application/json",
    "x-agenttool-client": "agenttool-sdk-ts/0.16.0",
  };
  const exact =
    `${AGENTTOOL_ORIGIN}/v1/wake?identity_id=${IDENTITY_ID}&profile=brief`;
  const changes = [
    [exact.replace("api.agenttool.dev", "example.com"), { headers }],
    [exact.replace("/v1/wake?", "/v1/wake/voice?"), { headers }],
    [`${exact}&format=json`, { headers }],
    [`${AGENTTOOL_ORIGIN}/v1/wake?profile=brief&identity_id=${IDENTITY_ID}`, { headers }],
    [exact, { method: "POST", headers, body: "{}" }],
    [exact, { headers: { ...headers, authorization: "Bearer no" } }],
    [exact, { headers: { ...headers, "x-extra": "no" } }],
  ];
  for (const [url, init] of changes) {
    await assert.rejects(guarded.request(url, init), BridgeError);
  }
  assert.equal(forwards, 0);
});

test("Kingdom output and CLI arguments are bounded and have no identity override", () => {
  assert.deepEqual(parseKingdomJson(JSON.stringify(SHOW), "test"), SHOW);
  assert.throws(() => parseKingdomJson("[]", "test"), BridgeError);
  assert.throws(
    () => parseKingdomJson(`{"x":"${"a".repeat(MAX_KINGDOM_OUTPUT_BYTES)}"}`, "test"),
    /exceeds/,
  );
  assert.equal(validateCanonicalIdentityId(IDENTITY_ID), IDENTITY_ID);
  assert.deepEqual(
    parseArgs([
      "--citizen", "joy",
      "--socket", "/tmp/agentcred.sock",
      "--credential", "agenttool/kingdom",
    ]),
    {
      citizen: "joy",
      socketPath: "/tmp/agentcred.sock",
      credential: "agenttool/kingdom",
    },
  );
  assert.throws(
    () => parseArgs([
      "--citizen", "joy",
      "--identity-id", IDENTITY_ID,
      "--socket", "/tmp/agentcred.sock",
      "--credential", "agenttool/kingdom",
    ]),
    /unknown argument/,
  );
});

test("wake validator requires every identity-bearing brief field", () => {
  assert.equal(validateWakeIdentity(WAKE, IDENTITY_ID, DID), WAKE);
});

test("credential-broker 0.1 accepts the zero-byte one-use GET grant", async () => {
  const consent = new PolicyConsent([
    {
      credential: "agenttool/kingdom",
      origin: AGENTTOOL_ORIGIN,
      methods: ["GET"],
      pathPrefixes: ["/v1/wake"],
      queryNames: ["identity_id", "profile"],
      allowPaymentSignature: false,
      maxTtlSeconds: 120,
      maxUses: 1,
      maxRequestBytes: 0,
      maxResponseBytes: 32768,
    },
  ]);
  assert.deepEqual(
    await consent.decide(buildGrantRequest("agenttool/kingdom"), {
      sessionId: "hermetic-test",
      signal: AbortSignal.timeout(1000),
    }),
    { allowed: true },
  );
});
