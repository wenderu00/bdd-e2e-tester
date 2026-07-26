#!/usr/bin/env node

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "hooks", "validate-gherkin.mjs");

function runHook(cwd, relPath, content) {
  const absPath = path.join(cwd, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: absPath },
    cwd,
  });
  const res = spawnSync("node", [SCRIPT], { input, encoding: "utf8" });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test("feature valido: Feature + Scenario + steps", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-gherkin-test-"));
  const { status } = runHook(
    dir,
    "features/US-1.feature",
    "Feature: Adicionar produto ao carrinho\n  Scenario: Caminho feliz\n    Given o cliente esta vendo um produto\n    When o cliente clica em \"Adicionar\"\n    Then o produto aparece no carrinho\n"
  );
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("feature valido com Rule: envolvendo o scenario", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-gherkin-test-"));
  const { status } = runHook(
    dir,
    "features/UC-2.feature",
    "Feature: Checkout\n  Rule: Desconto maximo de 20%\n    Scenario: Aplicar desconto valido\n      Given o cliente tem um cupom de 10%\n      When o cliente aplica o cupom\n      Then o desconto de 10% e aplicado\n"
  );
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("gherkin sintaticamente invalido (step antes de Feature): bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-gherkin-test-"));
  const { status, stderr } = runHook(
    dir,
    "features/US-2.feature",
    'Given algo acontece antes\nFeature: X\n  Scenario: Y\n    Given z\n'
  );
  assert.equal(status, 2);
  assert.match(stderr, /Gherkin inválido/);
  rmSync(dir, { recursive: true, force: true });
});

test("feature sem nenhum Scenario: bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-gherkin-test-"));
  const { status, stderr } = runHook(
    dir,
    "features/US-3.feature",
    "Feature: Sem cenario\n  Isso aqui nao vira nenhum Scenario valido\n"
  );
  assert.equal(status, 2);
  assert.match(stderr, /nenhum 'Scenario:' encontrado/);
  rmSync(dir, { recursive: true, force: true });
});

test("arquivo fora de features/: hook ignora (exit 0, sem parsear)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-gherkin-test-"));
  const { status } = runHook(dir, "user-stories/US-1.yaml", "isso nao e gherkin nem deveria ser checado");
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});
