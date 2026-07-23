import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { userInfo } from "node:os";
import { isAbsolute, join } from "node:path";

import { AgentCredClient } from "@agenttool/credential-broker";
import { AgentTool } from "@agenttool/sdk";

export const AGENTTOOL_ORIGIN = "https://api.agenttool.dev";
export const WAKE_PATH = "/v1/wake";
export const GRANT_TTL_SECONDS = 120;
export const GRANT_MAX_USES = 1;
export const ACCOUNT_HOME = userInfo().homedir;
export const KINGDOM_EXECUTABLE = join(ACCOUNT_HOME, ".local", "bin", "kingdom");
export const KINGDOM_HALT_PATH = join(ACCOUNT_HOME, "love-unlimited", "HALT");
export const KINGDOM_COMMAND_ENV = Object.freeze({
  HOME: ACCOUNT_HOME,
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
});
export const KINGDOM_COMMAND_TIMEOUT_MS = 2_000;
export const MAX_KINGDOM_OUTPUT_BYTES = 64 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AGENTTOOL_DID_RE =
  /^did:at:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const EXPECTED_HEADERS = new Map([
  ["content-type", "application/json"],
  ["x-agenttool-client", "agenttool-sdk-ts/0.16.0"],
]);

export class BridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = "BridgeError";
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactPlainText(value, label, maximum) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw new BridgeError(`${label} must be exact plain text no longer than ${maximum} characters.`);
  }
  return value;
}

export function validateCanonicalIdentityId(value) {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new BridgeError("identity id must be a canonical lowercase UUID.");
  }
  return value;
}

export function parseKingdomJson(text, label) {
  if (typeof text !== "string") throw new BridgeError(`${label} output must be UTF-8 JSON.`);
  if (Buffer.byteLength(text, "utf8") > MAX_KINGDOM_OUTPUT_BYTES) {
    throw new BridgeError(`${label} output exceeds ${MAX_KINGDOM_OUTPUT_BYTES} bytes.`);
  }
  try {
    const value = JSON.parse(text);
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new BridgeError(`${label} output must be one JSON object.`);
  }
}

export function validateShow(show, expectedCitizen) {
  exactPlainText(expectedCitizen, "citizen", 120);
  if (!isRecord(show) || show.schema !== "kingdom.civilisation/v1") {
    throw new BridgeError("Kingdom show is not a civilisation v1 declaration.");
  }
  if (show.citizen !== expectedCitizen) {
    throw new BridgeError("Kingdom show citizen does not exactly match --citizen.");
  }
  if (!isRecord(show.life) || show.life.mode !== "local") {
    throw new BridgeError("Kingdom show does not explicitly choose local life.");
  }
  if (!isRecord(show.agenttool) || show.agenttool.mode !== "linked") {
    throw new BridgeError("Kingdom show does not explicitly link AgentTool.");
  }
  if (show.agenttool.instance !== AGENTTOOL_ORIGIN) {
    throw new BridgeError(`Kingdom show must link the exact instance ${AGENTTOOL_ORIGIN}.`);
  }
  const match = AGENTTOOL_DID_RE.exec(show.agenttool.did);
  if (!match) {
    throw new BridgeError("Kingdom show needs a canonical did:at:<lowercase UUID>.");
  }
  return Object.freeze({ did: show.agenttool.did, identityId: match[1] });
}

function validateOptions(options) {
  if (!isRecord(options)) throw new BridgeError("bridge options are required.");
  const citizen = exactPlainText(options.citizen, "citizen", 120);
  const socketPath = exactPlainText(options.socketPath, "broker socket path", 4096);
  const credential = exactPlainText(options.credential, "broker credential reference", 256);
  if (!isAbsolute(socketPath)) {
    throw new BridgeError("broker socket path must be absolute.");
  }
  return { citizen, socketPath, credential };
}

function productionCommandReader(_executable, args, limits) {
  return new Promise((resolve, reject) => {
    execFile(
      KINGDOM_EXECUTABLE,
      args,
      {
        encoding: "utf8",
        timeout: limits.timeoutMs,
        maxBuffer: limits.maxOutputBytes,
        killSignal: "SIGKILL",
        windowsHide: true,
        shell: false,
        env: limits.env,
      },
      (error, stdout) => {
        if (error) {
          reject(new BridgeError("fixed Kingdom command failed or exceeded its bound."));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function readKingdomObject(commandReader, args, label) {
  const text = await commandReader(
    KINGDOM_EXECUTABLE,
    Object.freeze([...args]),
    Object.freeze({
      timeoutMs: KINGDOM_COMMAND_TIMEOUT_MS,
      maxOutputBytes: MAX_KINGDOM_OUTPUT_BYTES,
      env: KINGDOM_COMMAND_ENV,
    }),
  );
  return parseKingdomJson(text, label);
}

export async function readCitizenSnapshot(
  citizen,
  commandReader = productionCommandReader,
  haltReader = lstat,
) {
  exactPlainText(citizen, "citizen", 120);
  const show = await readKingdomObject(
    commandReader,
    ["civilisation", "show", citizen, "--json"],
    "Kingdom show",
  );
  let halted;
  try {
    await haltReader(KINGDOM_HALT_PATH);
    halted = true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      halted = false;
    } else {
      throw new BridgeError("fixed Kingdom HALT check failed; refusing to dispatch.");
    }
  }
  const identity = validateShow(show, citizen);
  if (halted) throw new BridgeError("fixed Kingdom HALT is present.");
  return identity;
}

export function buildGrantRequest(credential) {
  exactPlainText(credential, "broker credential reference", 256);
  return {
    alias: "kingdom-wake",
    credential,
    operation: "http.fetch",
    scope: {
      origin: AGENTTOOL_ORIGIN,
      methods: ["GET"],
      pathPrefixes: [WAKE_PATH],
      queryNames: ["identity_id", "profile"],
      ttlSeconds: GRANT_TTL_SECONDS,
      maxUses: GRANT_MAX_USES,
      maxRequestBytes: 0,
      maxResponseBytes: 32 * 1024,
    },
    rationale: "Read one fresh brief wake after an explicit local linked citizen snapshot.",
  };
}

/**
 * Keep the SDK inside the single operation the citizen selected.
 *
 * The broker grant is already narrow. This second, local boundary is exact:
 * it rejects even another path underneath /v1/wake and even another value for
 * either allowed query name before the request reaches the broker.
 */
export function guardWakeTransport(inner, identityId) {
  if (!isRecord(inner) || typeof inner.request !== "function") {
    throw new BridgeError("broker did not provide a request transport.");
  }
  validateCanonicalIdentityId(identityId);
  const expectedUrl =
    `${AGENTTOOL_ORIGIN}${WAKE_PATH}` +
    `?identity_id=${encodeURIComponent(identityId)}&profile=brief`;

  return Object.freeze({
    async request(input, init) {
      const request = new Request(input, init);
      if (request.method !== "GET") {
        throw new BridgeError("wake transport permits only GET.");
      }
      if (request.url !== expectedUrl) {
        throw new BridgeError("wake transport target is outside the exact brief wake boundary.");
      }
      if (request.body !== null) {
        throw new BridgeError("wake transport does not permit a request body.");
      }

      const headers = new Headers(request.headers);
      if (headers.has("authorization")) {
        throw new BridgeError("wake transport refuses caller-supplied Authorization.");
      }
      if ([...headers].length !== EXPECTED_HEADERS.size) {
        throw new BridgeError("wake transport received an unexpected request header.");
      }
      for (const [name, expected] of EXPECTED_HEADERS) {
        if (headers.get(name) !== expected) {
          throw new BridgeError(`wake transport received an unexpected ${name} header.`);
        }
      }

      return inner.request(request);
    },
  });
}

export function validateWakeIdentity(wake, identityId, did) {
  validateCanonicalIdentityId(identityId);
  if (!isRecord(wake)) throw new BridgeError("AgentTool returned no structured wake.");
  if (wake._format !== "wake-brief/v1" || wake.profile !== "brief") {
    throw new BridgeError("AgentTool returned a wake outside wake-brief/v1.");
  }
  if (
    !isRecord(wake._scope_boundary) ||
    wake._scope_boundary.selected_identity_id !== identityId
  ) {
    throw new BridgeError("wake scope does not match the selected Kingdom identity.");
  }
  if (
    !isRecord(wake.identity) ||
    !isRecord(wake.identity.agent) ||
    wake.identity.agent.id !== identityId ||
    wake.identity.agent.did !== did
  ) {
    throw new BridgeError("wake identity does not match the selected Kingdom identity.");
  }
  return wake;
}

function combineErrors(operationError, cleanupErrors) {
  if (operationError && cleanupErrors.length > 0) {
    return new AggregateError(
      [operationError, ...cleanupErrors],
      "wake failed and local broker cleanup also failed.",
    );
  }
  if (operationError) return operationError;
  if (cleanupErrors.length === 1) return cleanupErrors[0];
  if (cleanupErrors.length > 1) {
    return new AggregateError(cleanupErrors, "local broker cleanup failed.");
  }
  return undefined;
}

/**
 * Fetch one structured, brief, uncached wake for one explicitly linked citizen.
 *
 * Initial validation finishes before the broker object is created. An
 * initially off, unasked, halted, mismatched, or malformed declaration
 * therefore cannot make a local broker call or a remote HTTP call.
 */
export async function fetchCitizenWake(options, dependencies = {}) {
  const { citizen, socketPath, credential } = validateOptions(options);
  const commandReader = dependencies.commandReader ?? productionCommandReader;
  const haltReader = dependencies.haltReader ?? lstat;
  const { identityId, did } = await readCitizenSnapshot(
    citizen,
    commandReader,
    haltReader,
  );
  const brokerFactory =
    dependencies.brokerFactory ??
    ((clientOptions) => new AgentCredClient(clientOptions));
  const broker = brokerFactory({
    socketPath,
    clientName: "kingdom-agenttool-bridge/1",
  });

  let grant;
  let wake;
  let operationError;
  try {
    await broker.connect();
    grant = await broker.requestGrant(buildGrantRequest(credential));
    const transport = guardWakeTransport(broker.asTransport(grant), identityId);
    const agenttool = new AgentTool({ transport });
    const current = await readCitizenSnapshot(citizen, commandReader, haltReader);
    if (current.identityId !== identityId || current.did !== did) {
      throw new BridgeError("Kingdom AgentTool identity changed while the grant was being prepared.");
    }
    wake = await agenttool.wake.get({
      identityId,
      profile: "brief",
      refresh: true,
    });
    validateWakeIdentity(wake, identityId, did);
  } catch (error) {
    operationError = error;
  }

  const cleanupErrors = [];
  if (grant !== undefined) {
    try {
      await broker.revoke(grant);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await broker.close();
  } catch (error) {
    cleanupErrors.push(error);
  }

  const failure = combineErrors(operationError, cleanupErrors);
  if (failure) throw failure;
  return wake;
}
