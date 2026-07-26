#!/usr/bin/env node

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "hooks", "validate-index.mjs");

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

test("page_object_index valido", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status } = runHook(
    dir,
    "page-objects/_indice/INDEX.yaml",
    'schema_version: 1\nentradas:\n  - nome_pagina: "checkout"\n    arquivo: "page-objects/checkout.page.ts"\n    classe: "CheckoutPage"\n    metodos: ["confirmarPagamento"]\n    origens: ["UC-2"]\n'
  );
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("page_object_index invalido (origens vazia): bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status, stderr } = runHook(
    dir,
    "page-objects/_indice/INDEX.yaml",
    'schema_version: 1\nentradas:\n  - nome_pagina: "checkout"\n    arquivo: "page-objects/checkout.page.ts"\n    classe: "CheckoutPage"\n    metodos: []\n    origens: []\n'
  );
  assert.equal(status, 2);
  assert.match(stderr, /Schema inválido/);
  assert.match(stderr, /origens/);
  rmSync(dir, { recursive: true, force: true });
});

test("step_index valido", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status } = runHook(
    dir,
    "step-definitions/_indice/INDEX.yaml",
    'schema_version: 1\nentradas:\n  - texto_step: "o cliente clica em {string}"\n    palavra_chave: When\n    arquivo: "step-definitions/US-1.steps.ts"\n    origens: ["US-1"]\n'
  );
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("step_index invalido (palavra_chave fora do enum): bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status, stderr } = runHook(
    dir,
    "step-definitions/_indice/INDEX.yaml",
    'schema_version: 1\nentradas:\n  - texto_step: "o cliente clica em {string}"\n    palavra_chave: Maybe\n    arquivo: "step-definitions/US-1.steps.ts"\n    origens: ["US-1"]\n'
  );
  assert.equal(status, 2);
  assert.match(stderr, /palavra_chave/);
  rmSync(dir, { recursive: true, force: true });
});

test("cobertura invalida (status fora do enum): bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status, stderr } = runHook(
    dir,
    "features/_cobertura/COBERTURA.yaml",
    'schema_version: 1\nentradas:\n  - origem_id: "US-1"\n    tipo: user_story\n    feature_gerado: "features/US-1.feature"\n    page_objects_atualizados: []\n    step_definitions_gerados: []\n    status: talvez\n    auditoria: {feature: aprovado, page_object: nao_processado, step_definitions: nao_processado}\n'
  );
  assert.equal(status, 2);
  assert.match(stderr, /status/);
  rmSync(dir, { recursive: true, force: true });
});

test("execucao valida", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status } = runHook(
    dir,
    "features/_execucoes/RUN-1.yaml",
    'execucao_id: RUN-1\nresumo_origem: "teste"\nconcluido: false\ncartoes: []\n'
  );
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("execucao com id de arquivo divergente do campo: bloqueia", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status, stderr } = runHook(
    dir,
    "features/_execucoes/RUN-1.yaml",
    'execucao_id: RUN-2\nresumo_origem: "teste"\nconcluido: false\ncartoes: []\n'
  );
  assert.equal(status, 2);
  assert.match(stderr, /execucao_id/);
  rmSync(dir, { recursive: true, force: true });
});

test("YAML invalido: bloqueia com mensagem de sintaxe", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status, stderr } = runHook(
    dir,
    "page-objects/_indice/INDEX.yaml",
    "schema_version: 1\nentradas: [nome_pagina: sem fechar colchete\n"
  );
  assert.equal(status, 2);
  assert.match(stderr, /YAML inválido/);
  rmSync(dir, { recursive: true, force: true });
});

test("arquivo fora dos caminhos de indice: hook ignora", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-index-test-"));
  const { status } = runHook(dir, "features/US-1.feature", "qualquer coisa");
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});
