#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CHECK_ONLY = process.argv.includes("--check");

const SCHEMAS_PATH = path.join(ROOT, "schemas", "schemas.json");
const schemas = JSON.parse(readFileSync(SCHEMAS_PATH, "utf8"));

const TARGET_FILES = [
  "agents/orquestrador-e2e.md",
  "agents/gerador-feature.md",
  "agents/gerador-page-object.md",
  "agents/gerador-step-definitions.md",
  "agents/auditor-qualidade-e2e.md",
  "README.md",
];

const MARKER_RE =
  /<!-- SYNC:(schema|fragment):([a-zA-Z0-9_:]+):START -->([\s\S]*?)<!-- SYNC:\1:\2:END -->/g;

function renderSchemaBlock(typeName) {
  const entry = schemas[typeName];
  if (!entry) {
    throw new Error(`schemas.json não tem uma entrada para o tipo "${typeName}"`);
  }
  if (!entry.example_yaml) {
    throw new Error(`schemas.json entrada "${typeName}" não tem example_yaml`);
  }
  return "\n```yaml\n" + entry.example_yaml + "\n```\n";
}

function renderFragmentBlock(fragmentRef) {
  const [fragmentId, param] = fragmentRef.split(":");
  const fragment = schemas.fragments && schemas.fragments[fragmentId];
  if (fragment === undefined) {
    throw new Error(`schemas.json não tem fragments.${fragmentId}`);
  }
  const rendered = param
    ? fragment.replaceAll("{{TIPO_ARTEFATO}}", param)
    : fragment;
  return "\n" + rendered + "\n";
}

function renderMarker(kind, id) {
  if (kind === "schema") return renderSchemaBlock(id);
  if (kind === "fragment") return renderFragmentBlock(id);
  throw new Error(`tipo de marcador desconhecido: ${kind}`);
}

function syncFile(relPath) {
  const absPath = path.join(ROOT, relPath);
  const original = readFileSync(absPath, "utf8");

  let changed = false;
  const updated = original.replace(
    MARKER_RE,
    (fullMatch, kind, id, _innerOld) => {
      const rendered = renderMarker(kind, id);
      const newBlock = `<!-- SYNC:${kind}:${id}:START -->${rendered}<!-- SYNC:${kind}:${id}:END -->`;
      if (newBlock !== fullMatch) changed = true;
      return newBlock;
    }
  );

  return { relPath, absPath, original, updated, changed };
}

let anyMarkersFound = false;
const results = [];

for (const relPath of TARGET_FILES) {
  const absPath = path.join(ROOT, relPath);
  let content;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    continue;
  }
  const markerCount = (content.match(MARKER_RE) || []).length;
  if (markerCount === 0) continue;
  anyMarkersFound = true;

  const result = syncFile(relPath);
  results.push(result);
}

if (!anyMarkersFound) {
  console.log(
    "Nenhum marcador SYNC encontrado ainda nos arquivos-alvo — nada para sincronizar."
  );
  process.exit(0);
}

if (CHECK_ONLY) {
  const drifted = results.filter((r) => r.changed);
  if (drifted.length === 0) {
    console.log("OK — todos os blocos marcados batem com schemas/schemas.json.");
    process.exit(0);
  }
  console.error(
    `Divergência encontrada em ${drifted.length} arquivo(s) (rode sem --check para corrigir):`
  );
  for (const r of drifted) console.error(`  - ${r.relPath}`);
  process.exit(1);
}

let writtenCount = 0;
for (const r of results) {
  if (r.changed) {
    writeFileSync(r.absPath, r.updated, "utf8");
    writtenCount++;
    console.log(`atualizado: ${r.relPath}`);
  }
}
console.log(
  writtenCount === 0
    ? "Nada para atualizar — já estava em sincronia."
    : `${writtenCount} arquivo(s) atualizado(s).`
);
