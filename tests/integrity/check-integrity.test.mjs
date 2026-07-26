#!/usr/bin/env node

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "check-integrity.mjs");

function makeTree(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "check-integrity-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(dir, relPath);
    mkdirSync(path.dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, "utf8");
  }
  return dir;
}

function run(dir) {
  const res = spawnSync("node", [SCRIPT, dir], { encoding: "utf8" });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test("árvore limpa: 1 cartão coberto, page object e step indexados, tudo em disco", () => {
  const dir = makeTree({
    "user-stories/US-1.yaml": "user_story_id: US-1\n",
    "features/US-1.feature": "Feature: X\n  Scenario: Y\n    Given z\n",
    "features/_cobertura/COBERTURA.yaml":
      'schema_version: 1\nentradas:\n  - origem_id: "US-1"\n    tipo: user_story\n    feature_gerado: "features/US-1.feature"\n    page_objects_atualizados: []\n    step_definitions_gerados: []\n    status: concluido\n    auditoria: {feature: aprovado, page_object: nao_processado, step_definitions: nao_processado}\n',
    "page-objects/checkout.page.ts": "export class CheckoutPage {}\n",
    "page-objects/_indice/INDEX.yaml":
      'schema_version: 1\nentradas:\n  - nome_pagina: "checkout"\n    arquivo: "page-objects/checkout.page.ts"\n    classe: "CheckoutPage"\n    metodos: []\n    origens: ["US-1"]\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 0);
  assert.match(stdout, /Nenhum erro de integridade encontrado/);
  rmSync(dir, { recursive: true, force: true });
});

test("COBERTURA aponta feature que não existe em disco: erro", () => {
  const dir = makeTree({
    "features/_cobertura/COBERTURA.yaml":
      'schema_version: 1\nentradas:\n  - origem_id: "US-1"\n    tipo: user_story\n    feature_gerado: "features/US-1.feature"\n    page_objects_atualizados: []\n    step_definitions_gerados: []\n    status: concluido\n    auditoria: {feature: aprovado, page_object: nao_processado, step_definitions: nao_processado}\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 1);
  assert.match(stdout, /Artefato ausente.*features\/US-1\.feature/s);
  rmSync(dir, { recursive: true, force: true });
});

test("índice de page objects aponta arquivo inexistente: erro", () => {
  const dir = makeTree({
    "page-objects/_indice/INDEX.yaml":
      'schema_version: 1\nentradas:\n  - nome_pagina: "checkout"\n    arquivo: "page-objects/checkout.page.ts"\n    classe: "CheckoutPage"\n    metodos: []\n    origens: ["US-1"]\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 1);
  assert.match(stdout, /Artefato ausente.*page-objects\/checkout\.page\.ts/s);
  rmSync(dir, { recursive: true, force: true });
});

test("índice de steps aponta arquivo inexistente: erro", () => {
  const dir = makeTree({
    "step-definitions/_indice/INDEX.yaml":
      'schema_version: 1\nentradas:\n  - texto_step: "o cliente clica em {string}"\n    palavra_chave: When\n    arquivo: "step-definitions/US-1.steps.ts"\n    origens: ["US-1"]\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 1);
  assert.match(stdout, /Artefato ausente.*step-definitions\/US-1\.steps\.ts/s);
  rmSync(dir, { recursive: true, force: true });
});

test("COBERTURA referencia cartão de origem removido: aviso, não erro", () => {
  const dir = makeTree({
    "features/US-1.feature": "Feature: X\n  Scenario: Y\n    Given z\n",
    "features/_cobertura/COBERTURA.yaml":
      'schema_version: 1\nentradas:\n  - origem_id: "US-1"\n    tipo: user_story\n    feature_gerado: "features/US-1.feature"\n    page_objects_atualizados: []\n    step_definitions_gerados: []\n    status: concluido\n    auditoria: {feature: aprovado, page_object: nao_processado, step_definitions: nao_processado}\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 0);
  assert.match(stdout, /aviso/);
  assert.match(stdout, /US-1/);
  rmSync(dir, { recursive: true, force: true });
});

test("índice referencia origem que não está em COBERTURA: aviso, não erro", () => {
  const dir = makeTree({
    "page-objects/checkout.page.ts": "export class CheckoutPage {}\n",
    "page-objects/_indice/INDEX.yaml":
      'schema_version: 1\nentradas:\n  - nome_pagina: "checkout"\n    arquivo: "page-objects/checkout.page.ts"\n    classe: "CheckoutPage"\n    metodos: []\n    origens: ["US-99"]\n',
  });
  const { status, stdout } = run(dir);
  assert.equal(status, 0);
  assert.match(stdout, /Referência pendente.*US-99/s);
  rmSync(dir, { recursive: true, force: true });
});
