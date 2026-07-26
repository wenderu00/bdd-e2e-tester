#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "./vendor/js-yaml.mjs";

const TARGET_DIR = path.resolve(process.argv[2] || process.cwd());

function readYaml(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    return loadYaml(readFileSync(absPath, "utf8"));
  } catch {
    return null;
  }
}

function sourceCardExists(origemId) {
  if (/^US-\d+$/.test(origemId)) {
    return existsSync(path.join(TARGET_DIR, "user-stories", `${origemId}.yaml`));
  }
  if (/^UC-\d+$/.test(origemId)) {
    return existsSync(path.join(TARGET_DIR, "casos-de-uso", `${origemId}.yaml`));
  }
  return true; // formato inesperado — não é este script que valida o padrão do ID
}

const cobertura = readYaml(
  path.join(TARGET_DIR, "features", "_cobertura", "COBERTURA.yaml")
);
const pageObjectIndex = readYaml(
  path.join(TARGET_DIR, "page-objects", "_indice", "INDEX.yaml")
);
const stepIndex = readYaml(
  path.join(TARGET_DIR, "step-definitions", "_indice", "INDEX.yaml")
);

const coberturaEntradas = (cobertura && cobertura.entradas) || [];
const pageObjectEntradas = (pageObjectIndex && pageObjectIndex.entradas) || [];
const stepEntradas = (stepIndex && stepIndex.entradas) || [];

const coberturaOrigens = new Set(coberturaEntradas.map((e) => e.origem_id));

const errors = [];
const warnings = [];

// 1. COBERTURA aponta feature_gerado que não existe em disco
for (const entrada of coberturaEntradas) {
  if (!entrada.feature_gerado) continue;
  const absPath = path.join(TARGET_DIR, entrada.feature_gerado);
  if (!existsSync(absPath)) {
    errors.push(
      `Artefato ausente: features/_cobertura/COBERTURA.yaml referencia "${entrada.feature_gerado}" (origem ${entrada.origem_id}), que não existe em disco`
    );
  }
}

// 2. page-objects/_indice/INDEX.yaml aponta arquivo que não existe em disco
for (const entrada of pageObjectEntradas) {
  const absPath = path.join(TARGET_DIR, entrada.arquivo);
  if (!existsSync(absPath)) {
    errors.push(
      `Artefato ausente: page-objects/_indice/INDEX.yaml referencia "${entrada.arquivo}" (página "${entrada.nome_pagina}"), que não existe em disco`
    );
  }
}

// 3. step-definitions/_indice/INDEX.yaml aponta arquivo que não existe em disco
for (const entrada of stepEntradas) {
  const absPath = path.join(TARGET_DIR, entrada.arquivo);
  if (!existsSync(absPath)) {
    errors.push(
      `Artefato ausente: step-definitions/_indice/INDEX.yaml referencia "${entrada.arquivo}" (step "${entrada.texto_step}"), que não existe em disco`
    );
  }
}

// 4. Aviso: COBERTURA referencia um cartão de origem (US/UC) que não existe mais
for (const entrada of coberturaEntradas) {
  if (!sourceCardExists(entrada.origem_id)) {
    warnings.push(
      `Cartão de origem ausente: features/_cobertura/COBERTURA.yaml tem uma entrada para "${entrada.origem_id}", mas o cartão correspondente não existe mais em user-stories/ ou casos-de-uso/ (pode ter sido removido depois da geração do e2e)`
    );
  }
}

// 5. Aviso: índices referenciam origem_id que não aparece em COBERTURA.yaml
for (const entrada of pageObjectEntradas) {
  for (const origemId of entrada.origens || []) {
    if (!coberturaOrigens.has(origemId)) {
      warnings.push(
        `Referência pendente: page-objects/_indice/INDEX.yaml (página "${entrada.nome_pagina}") lista origem "${origemId}", que não aparece em features/_cobertura/COBERTURA.yaml`
      );
    }
  }
}
for (const entrada of stepEntradas) {
  for (const origemId of entrada.origens || []) {
    if (!coberturaOrigens.has(origemId)) {
      warnings.push(
        `Referência pendente: step-definitions/_indice/INDEX.yaml (step "${entrada.texto_step}") lista origem "${origemId}", que não aparece em features/_cobertura/COBERTURA.yaml`
      );
    }
  }
}

// --- Report ---
console.log(`Verificação de integridade em ${TARGET_DIR}`);
console.log(`Cartões cobertos (COBERTURA.yaml): ${coberturaEntradas.length}`);
console.log(`Page objects indexados: ${pageObjectEntradas.length}`);
console.log(`Steps indexados: ${stepEntradas.length}`);
console.log("");

if (errors.length === 0) {
  console.log("Nenhum erro de integridade encontrado.");
} else {
  console.log(`${errors.length} erro(s) de integridade:`);
  for (const e of errors) console.log(`  - ${e}`);
}

if (warnings.length > 0) {
  console.log("");
  console.log(`${warnings.length} aviso(s) (não bloqueiam):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

process.exit(errors.length === 0 ? 0 : 1);
