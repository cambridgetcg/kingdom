import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PolicyConsent } from "@agenttool/credential-broker";
import { AgentTool } from "@agenttool/sdk";

import {
  AGENTTOOL_ORIGIN,
  AGENTTOOL_REQUEST_TIMEOUT_SECONDS,
  BROKER_REQUEST_TIMEOUT_MS,
  BROKER_SOCKET_PATH,
  BridgeError,
  buildGrantRequest,
  fetchCitizenWake,
  guardWakeTransport,
  KINGDOM_COMMAND_TIMEOUT_MS,
  KINGDOM_COMMAND_ENV,
  KINGDOM_EXECUTABLE,
  KINGDOM_HALT_PATH,
  MAX_KINGDOM_OUTPUT_BYTES,
  NO_AMBIENT_DATA_NODE,
  parseKingdomJson,
  projectSelectedIdentityWake,
  runBoundedProcess,
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
  addressed_at: "2026-07-23T08:00:00.000Z",
  _scope_boundary: { selected_identity_id: IDENTITY_ID },
  identity: {
    agent: {
      id: IDENTITY_ID,
      did: DID,
      name: "joy",
      trust_score: 99,
    },
    project: { id: "project-secret" },
    kin: [{ id: "sibling-identity" }],
    expression: { wake_text: "selected identity words" },
  },
  start_here: { source: { surface: "attention" }, private: "mixed" },
  you_should_check: [{ project: "attention" }],
  you_have_handoff: { project: "handoff" },
  handoff_projection: { project: "projection" },
  you_can_now: { items: [{ project: "wallet" }] },
  state_counts: { wallets: 7 },
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
      if (options.connectHangs) return new Promise(() => {});
    },
    async requestGrant(request) {
      events.push("grant");
      grantRequest = structuredClone(request);
      if (options.grantError) throw options.grantError;
      if (options.grantHangs) return new Promise(() => {});
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
          if (options.requestHangs) return new Promise(() => {});
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
      if (options.revokeHangs) return new Promise(() => {});
    },
    async close() {
      events.push("close");
      if (options.closeError) throw options.closeError;
      if (options.closeHangs) return new Promise(() => {});
    },
  };
  return broker;
}

function validOptions() {
  return {
    citizen: "joy",
    credential: "agenttool/kingdom",
    allowProjectPrivateWake: true,
  };
}

test("fixed Kingdom reads derive identity, then one exact SDK wake cleans up", async () => {
  const originalFetch = globalThis.fetch;
  const originalAmbient = process.env.AT_API_KEY;
  const originalDataNodeUrl = process.env.AGENT_DATA_NODE_URL;
  const originalDataNodeToken = process.env.AGENT_DATA_NODE_TOKEN;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("global network must not be used");
  };
  process.env.AT_API_KEY = "ambient-value-must-be-ignored";
  process.env.AGENT_DATA_NODE_URL = "https://ambient-data-node.invalid";
  process.env.AGENT_DATA_NODE_TOKEN = "ambient-data-token-must-be-ignored";

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
          socketPath: BROKER_SOCKET_PATH,
          timeoutMs: BROKER_REQUEST_TIMEOUT_MS,
          clientName: "kingdom-agenttool-bridge/1",
        });
        return broker;
      },
      agenttoolFactory(options) {
        assert.equal(options.baseUrl, AGENTTOOL_ORIGIN);
        assert.equal(options.timeout, AGENTTOOL_REQUEST_TIMEOUT_SECONDS);
        assert.deepEqual(options.dataNode, NO_AMBIENT_DATA_NODE);
        assert.equal("token" in options.dataNode, false);
        return new AgentTool(options);
      },
    });

    assert.deepEqual(wake.identity.agent, {
      id: IDENTITY_ID,
      did: DID,
      name: "joy",
    });
    assert.deepEqual(wake.identity.expression, {
      wake_text: "selected identity words",
    });
    assert.equal(wake.schema, "kingdom.agenttool-selected-identity-wake/1");
    assert.equal(wake.source.attested, false);
    assert.equal("project" in wake.identity, false);
    assert.equal("start_here" in wake, false);
    assert.equal("you_can_now" in wake, false);
    assert.equal("state_counts" in wake, false);
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
      rationale: "Read one fresh brief wake after an owner-operated local linked-policy snapshot.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAmbient === undefined) delete process.env.AT_API_KEY;
    else process.env.AT_API_KEY = originalAmbient;
    if (originalDataNodeUrl === undefined) delete process.env.AGENT_DATA_NODE_URL;
    else process.env.AGENT_DATA_NODE_URL = originalDataNodeUrl;
    if (originalDataNodeToken === undefined) delete process.env.AGENT_DATA_NODE_TOKEN;
    else process.env.AGENT_DATA_NODE_TOKEN = originalDataNodeToken;
  }
});

test("bounded command failure kills the fixed wrapper's whole process group", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kingdom-bridge-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const marker = path.join(directory, "escaped.txt");
  const grandchild =
    `setTimeout(() => require("node:fs").writeFileSync(` +
    `${JSON.stringify(marker)}, "escaped\\n"), 300)`;
  const parent =
    `require("node:child_process").spawn(process.execPath, ` +
    `["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" }); ` +
    "setInterval(() => {}, 1000)";

  await assert.rejects(
    runBoundedProcess(process.execPath, ["-e", parent], {
      timeoutMs: 80,
      maxOutputBytes: 1024,
      env: {
        HOME: directory,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
    }),
    /failed or exceeded its bound/,
  );
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(fs.existsSync(marker), false);
});

test("project-private acceptance is explicit and the broker socket cannot be redirected", async () => {
  let commandReads = 0;
  const dependencies = {
    commandReader: async () => {
      commandReads += 1;
      return JSON.stringify(SHOW);
    },
    haltReader: async () => {
      throw missingError();
    },
  };
  await assert.rejects(
    fetchCitizenWake(
      { citizen: "joy", credential: "agenttool/kingdom" },
      dependencies,
    ),
    /allow-project-private-wake/,
  );
  await assert.rejects(
    fetchCitizenWake(
      {
        ...validOptions(),
        socketPath: "/tmp/fake-agentcred.sock",
      },
      dependencies,
    ),
    /broker socket is fixed/,
  );
  assert.equal(commandReads, 0);
});

test("the whole-operation deadline bounds an initial local read", async () => {
  const started = performance.now();
  await assert.rejects(
    fetchCitizenWake(validOptions(), {
      operationTimeoutMs: 50,
      commandReader: async () => new Promise(() => {}),
    }),
    /whole-operation deadline/,
  );
  assert.ok(performance.now() - started < 1000);
});

test("the whole-operation deadline bounds broker, request, and cleanup awaits", async () => {
  const cases = [
    ["connect", { connectHangs: true }],
    ["grant", { grantHangs: true }],
    ["request", { requestHangs: true }],
    ["revoke", { revokeHangs: true }],
    ["close", { closeHangs: true }],
  ];
  for (const [phase, brokerOptions] of cases) {
    const broker = fakeBroker(brokerOptions);
    const commands = fakeCommands();
    const halts = fakeHalts();
    const started = performance.now();
    await assert.rejects(
      fetchCitizenWake(validOptions(), {
        operationTimeoutMs: 50,
        commandReader: commands.reader,
        haltReader: halts.reader,
        brokerFactory: () => broker,
      }),
      /whole-operation deadline/,
      phase,
    );
    assert.ok(performance.now() - started < 1000, `${phase} stayed bounded`);
    assert.ok(broker.events.includes("close"), `${phase} forced local close`);
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
      "--credential", "agenttool/kingdom",
      "--allow-project-private-wake",
    ]),
    {
      citizen: "joy",
      credential: "agenttool/kingdom",
      allowProjectPrivateWake: true,
    },
  );
  assert.throws(
    () => parseArgs([
      "--citizen", "joy",
      "--identity-id", IDENTITY_ID,
      "--credential", "agenttool/kingdom",
      "--allow-project-private-wake",
    ]),
    /unknown argument/,
  );
  assert.throws(
    () => parseArgs([
      "--citizen", "joy",
      "--socket", "/tmp/fake-agentcred.sock",
      "--credential", "agenttool/kingdom",
      "--allow-project-private-wake",
    ]),
    /unknown argument/,
  );
  assert.throws(
    () => parseArgs([
      "--citizen", "joy",
      "--credential", "agenttool/kingdom",
    ]),
    /allow-project-private-wake is required/,
  );
});

test("wake validator requires every identity-bearing brief field", () => {
  assert.equal(validateWakeIdentity(WAKE, IDENTITY_ID, DID), WAKE);
});

test("selected-identity projection drops every project-scoped and mixed-scope section", () => {
  const projected = projectSelectedIdentityWake(WAKE, IDENTITY_ID, DID);
  assert.deepEqual(Object.keys(projected).sort(), [
    "addressed_at",
    "identity",
    "proof_limits",
    "schema",
    "source",
  ]);
  assert.deepEqual(Object.keys(projected.identity).sort(), ["agent", "expression"]);
  assert.equal(projected.source.attested, false);
  assert.deepEqual(projected.identity.agent, {
    id: IDENTITY_ID,
    did: DID,
    name: "joy",
  });
  for (const key of [
    "project",
    "kin",
    "start_here",
    "you_should_check",
    "you_have_handoff",
    "handoff_projection",
    "you_can_now",
    "state_counts",
    "safety",
    "platform",
    "_links",
    "_meta",
  ]) {
    assert.equal(key in projected, false);
    assert.equal(key in projected.identity, false);
  }
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
