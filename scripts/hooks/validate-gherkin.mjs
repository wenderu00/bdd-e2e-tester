#!/usr/bin/env node

import { readFileSync } from "node:fs";
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

function collectScenarios(children) {
  const scenarios = [];
  for (const child of children || []) {
    if (child.scenario) scenarios.push(child.scenario);
    if (child.rule) scenarios.push(...collectScenarios(child.rule.children));
  }
  return scenarios;
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
if (!/^features\/.*\.feature$/.test(relPath)) process.exit(0);

let content;
try {
  content = readFileSync(filePath, "utf8");
} catch {
  process.exit(0);
}

let gherkin, messages;
try {
  gherkin = await import("@cucumber/gherkin");
  messages = await import("@cucumber/messages");
} catch {
  warn(
    relPath,
    "@cucumber/gherkin não está instalado nas dependências do plugin — validação de sintaxe Gherkin " +
      "desativada. Rode `npm install` na raiz do plugin bdd-e2e-tester para ativá-la."
  );
}

let doc;
try {
  const builder = new gherkin.AstBuilder(messages.IdGenerator.uuid());
  const matcher = new gherkin.GherkinClassicTokenMatcher();
  const parser = new gherkin.Parser(builder, matcher);
  doc = parser.parse(content);
} catch (err) {
  const details =
    err && Array.isArray(err.errors)
      ? err.errors.map((e) => `  - ${e.message}`)
      : [`  - ${String(err.message || err)}`];
  fail([
    `Gherkin inválido em ${relPath}:`,
    ...details,
    "",
    "Reescreva o arquivo com Write corrigindo o(s) erro(s) de sintaxe apontado(s) acima.",
  ]);
}

if (!doc.feature) {
  fail([
    `Gherkin inválido em ${relPath}:`,
    "  - nenhum bloco 'Feature:' encontrado",
    "",
    "Reescreva o arquivo garantindo que ele comece com 'Feature: <título>'.",
  ]);
}

const scenarios = collectScenarios(doc.feature.children);
if (scenarios.length === 0) {
  fail([
    `Gherkin inválido em ${relPath}:`,
    "  - nenhum 'Scenario:' encontrado (dentro da Feature ou de algum bloco 'Rule:')",
    "",
    "Reescreva o arquivo garantindo pelo menos 1 Scenario com steps Given/When/Then.",
  ]);
}

const stepless = scenarios.filter((s) => !s.steps || s.steps.length === 0);
if (stepless.length > 0) {
  fail([
    `Gherkin inválido em ${relPath}:`,
    ...stepless.map((s) => `  - Scenario "${s.name}" não tem nenhum step`),
    "",
    "Reescreva o(s) Scenario(s) listado(s) acima com pelo menos 1 step Given/When/Then.",
  ]);
}

process.exit(0);
