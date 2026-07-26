#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function fail(messages) {
  process.stderr.write(messages.join("\n") + "\n");
  process.exit(2);
}

function warn(relPath, message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Aviso (não bloqueante) para ${relPath}: ${message}`,
      },
    })
  );
  process.exit(0);
}

let raw;
try {
  raw = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

if (input.hook_event_name !== "PostToolUse" || input.tool_name !== "Write") {
  process.exit(0);
}

const filePath = input.tool_input && input.tool_input.file_path;
const cwd = input.cwd;
if (!filePath || !cwd) process.exit(0);

const relPath = path.relative(cwd, filePath).split(path.sep).join("/");
if (!/^(page-objects|step-definitions)\/.*\.(page|steps)\.ts$/.test(relPath)) {
  process.exit(0);
}

const tscBin = path.join(cwd, "node_modules", ".bin", "tsc");
if (!existsSync(path.join(cwd, "node_modules")) || !existsSync(tscBin)) {
  warn(
    relPath,
    "projeto alvo ainda não tem `node_modules`/`typescript` instalado (scaffold criado pelo " +
      "orquestrador-e2e mas `npm install` ainda não rodou) — checagem de tipos TypeScript " +
      "desativada até lá."
  );
}

const result = spawnSync(
  tscBin,
  ["--noEmit", "--skipLibCheck", relPath],
  { cwd, encoding: "utf8" }
);

if (result.error) {
  warn(relPath, `não foi possível executar tsc (${result.error.message}).`);
}

if (result.status !== 0) {
  fail([
    `TypeScript não compila em ${relPath}:`,
    (result.stdout || result.stderr || "").trim(),
    "",
    "Reescreva o arquivo com Write corrigindo o(s) erro(s) de tipo apontado(s) acima.",
  ]);
}

process.exit(0);
