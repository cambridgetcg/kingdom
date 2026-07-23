#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  BridgeError,
  fetchCitizenWake,
} from "./bridge.mjs";

const USAGE = `Usage:
  node agenttool-bridge/cli.mjs \\
    --citizen CITIZEN \\
    --socket /absolute/path/to/agentcred.sock \\
    --credential OWNER_REFERENCE

Reads the citizen declaration through the fixed ~/.local/bin/kingdom and
checks the fixed account-home HALT path, then prints one fresh brief wake as
JSON. It never registers an identity or reads AT_API_KEY.
`;

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new BridgeError(`${flag} needs a value.`);
  }
  return value;
}

export function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }
  const options = {};
  const seen = new Set();
  const names = new Map([
    ["--citizen", "citizen"],
    ["--socket", "socketPath"],
    ["--credential", "credential"],
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const name = names.get(flag);
    if (!name) throw new BridgeError(`unknown argument: ${flag ?? "(missing)"}.`);
    if (seen.has(flag)) throw new BridgeError(`duplicate argument: ${flag}.`);
    seen.add(flag);
    options[name] = takeValue(argv, index, flag);
  }
  for (const [flag, name] of names) {
    if (options[name] === undefined) throw new BridgeError(`${flag} is required.`);
  }
  return options;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown failure";
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const output = io.stdout ?? process.stdout;
  const errors = io.stderr ?? process.stderr;
  try {
    const options = parseArgs(argv);
    if (options.help) {
      output.write(USAGE);
      return 0;
    }
    const wake = await fetchCitizenWake(options, io.dependencies);
    output.write(`${JSON.stringify(wake, null, 2)}\n`);
    return 0;
  } catch (error) {
    errors.write(`kingdom AgentTool bridge: ${errorMessage(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
