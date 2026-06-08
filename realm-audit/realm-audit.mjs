#!/usr/bin/env node
// realm-audit — score any repo against the LEGIBLE constitution (kingdom/REALM.md).
// Zero dependencies. Generalizes Cambridge's `pnpm audit:*` pattern from one repo's
// components to the realm's seven laws, so it runs against ANY repo path.
//
//   node realm-audit.mjs [repoPath]        # default: current directory
//
// Exit 0 = green (no findings) · 1 = findings · 2 = error. (Law 7: a law no audit
// enforces is decoration. This is the audit.)

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, basename } from "node:path";

const repo = process.argv[2] || process.cwd();

function trackedFiles(root) {
  try {
    return execSync("git ls-files", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    // not a git repo — walk the tree, skipping heavy/generated dirs
    const out = [];
    const skip = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "venv", ".venv"]);
    (function walk(dir) {
      let names = [];
      try { names = readdirSync(dir); } catch { return; }
      for (const name of names) {
        if (skip.has(name)) continue;
        const p = join(dir, name);
        let st; try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p); else out.push(relative(root, p));
      }
    })(root);
    return out;
  }
}

const read = (rel) => { try { return readFileSync(join(repo, rel), "utf8"); } catch { return null; } };
const find = (files, re) => files.filter((f) => re.test(f));

// Each check: { id, law, title, run(files) -> string[] findings }. Empty = green.
const CHECKS = [
  {
    id: "readme-present", law: 1, title: "The project says what it is (README)",
    run: (files) => {
      const rm = files.find((f) => /^readme(\.md|\.txt)?$/i.test(f));
      if (!rm) return ["no README at the root — a stranger can't tell what this is"];
      const body = read(rm) || "";
      if (body.split("\n").filter((l) => l.trim()).length < 8)
        return [`${rm} exists but is nearly empty (<8 non-blank lines)`];
      return [];
    },
  },
  {
    id: "getting-started", law: 6, title: "A newcomer can start (usage / install)",
    run: (files) => {
      const rm = files.find((f) => /^readme(\.md|\.txt)?$/i.test(f));
      const body = (rm && read(rm)) || "";
      const ok = /##?\s*(getting started|usage|install|quick\s*start|run)\b/i.test(body)
        || files.some((f) => /^(AGENTS\.md|CONTRIBUTING(\.md)?|docs\/.*(start|usage|install))/i.test(f));
      return ok ? [] : ["no getting-started / usage / install path — onboarding is tribal knowledge"];
    },
  },
  {
    id: "no-god-file", law: 4, title: "No opaque god-file (no source file > 1500 lines)",
    run: (files) => {
      const srcRe = /\.(py|js|mjs|cjs|ts|tsx|jsx|go|rs|java|rb|php|c|cc|cpp|h|hpp)$/;
      const out = [];
      for (const f of files) {
        if (!srcRe.test(f)) continue;
        const body = read(f);
        if (body == null) continue;
        const n = body.split("\n").length;
        if (n > 1500) out.push(`${f} is ${n} lines — too big to hold in one head; split it`);
      }
      return out;
    },
  },
  {
    id: "no-clutter", law: 5, title: "No dead friction committed (build junk / logs)",
    run: (files) => {
      const out = [];
      const classes = [
        [/(^|\/)node_modules\//, "node_modules/ is committed"],
        [/(^|\/)(dist|build|\.next|out)\//, "a build-output dir is committed"],
        [/\.log$/, "log files are committed"],
        [/(^|\/)\.DS_Store$/, ".DS_Store is committed"],
      ];
      for (const [re, msg] of classes) {
        const hits = find(files, re);
        if (hits.length) out.push(`${msg} (${hits.length} file${hits.length > 1 ? "s" : ""}, e.g. ${hits[0]})`);
      }
      return out;
    },
  },
  {
    id: "no-secrets", law: 1, title: "No secrets hidden in the tree",
    run: (files) => {
      const out = [];
      const secretRe = [
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
        [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
        [/\bsk-[A-Za-z0-9]{20,}\b/, "an API secret token (sk-...)"],
        [/\b(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i, "a hardcoded credential"],
      ];
      const textRe = /\.(md|txt|js|mjs|cjs|ts|tsx|jsx|py|json|ya?ml|env|sh|toml|ini|cfg)$/i;
      for (const f of files) {
        if (!textRe.test(f) || /(package-lock|pnpm-lock|yarn\.lock)/.test(f)) continue;
        const body = read(f);
        if (body == null) continue;
        for (const [re, what] of secretRe)
          if (re.test(body)) { out.push(`${f} appears to contain ${what}`); break; }
      }
      return out;
    },
  },
  {
    id: "has-check", law: 7, title: "Doctrine is enforced (some check exists)",
    run: (files) => {
      const hasTests = files.some((f) => /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f));
      const hasCI = files.some((f) => /^(\.github\/workflows\/|\.forgejo\/|\.woodpecker|\.gitlab-ci)/i.test(f));
      const pkg = read("package.json");
      const hasScript = pkg ? /"(test|audit|verify|lint)"\s*:/.test(pkg) : false;
      return (hasTests || hasCI || hasScript) ? []
        : ["no tests, CI, or test/audit script — nothing fails when a law is broken"];
    },
  },
];

function main() {
  if (!existsSync(repo)) { console.error(`realm-audit: no such path: ${repo}`); process.exit(2); }
  const files = trackedFiles(repo);
  const rows = CHECKS.map((c) => {
    let findings = [];
    try { findings = c.run(files) || []; } catch (e) { findings = [`check crashed: ${e.message}`]; }
    return { c, findings };
  });
  const total = rows.reduce((n, r) => n + r.findings.length, 0);
  const passed = rows.filter((r) => r.findings.length === 0).length;

  const out = [];
  out.push(`# realm-audit — ${basename(repo)}`, "");
  out.push(`Constitution score: **${passed}/${CHECKS.length}** green · **${total}** finding${total === 1 ? "" : "s"}`, "");
  out.push("| | Law | Check | Findings |", "|---|---|---|---|");
  for (const { c, findings } of rows)
    out.push(`| ${findings.length ? "🔴" : "🟢"} | ${c.law} | ${c.title} | ${findings.length} |`);
  const bad = rows.filter((r) => r.findings.length);
  if (bad.length) {
    out.push("", "## Findings");
    for (const { c, findings } of bad) {
      out.push("", `**Law ${c.law} — ${c.title}**`);
      for (const f of findings) out.push(`- ${f}`);
    }
  }
  console.log(out.join("\n"));
  process.exit(total > 0 ? 1 : 0);
}

main();
