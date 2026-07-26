#!/usr/bin/env node

import {
  readFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "../../scripts/vendor/js-yaml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures");
const RUNS_DIR = path.join(ROOT, "tests", "eval", ".runs");

const CLI_TIMEOUT_MS = 6 * 60 * 1000;
const NPM_INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

const filterArg = process.argv[2];

function listFixtures() {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !filterArg || name.includes(filterArg))
    .sort();
}

function copyDirRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else copyFileSync(s, d);
  }
}

function placeInputCard(scratchDir, fixtureDir) {
  const files = readdirSync(fixtureDir).filter(
    (f) => f.endsWith(".yaml") && f !== "expected.yaml"
  );
  if (files.length !== 1) {
    throw new Error(
      `esperava exatamente 1 arquivo <ID>.yaml (cartão de entrada) em ${fixtureDir}, achei ${files.length}`
    );
  }
  const cardFile = files[0];
  const targetSubdir = cardFile.startsWith("US-")
    ? "user-stories"
    : cardFile.startsWith("UC-")
    ? "casos-de-uso"
    : null;
  if (!targetSubdir) {
    throw new Error(`nome de cartão inesperado "${cardFile}" (esperava prefixo US- ou UC-)`);
  }
  mkdirSync(path.join(scratchDir, targetSubdir), { recursive: true });
  copyFileSync(
    path.join(fixtureDir, cardFile),
    path.join(scratchDir, targetSubdir, cardFile)
  );

  const supportDir = path.join(fixtureDir, "support");
  if (existsSync(supportDir)) copyDirRecursive(supportDir, scratchDir);

  return { cardFile, origemId: cardFile.replace(/\.yaml$/, "") };
}

function countScenarios(featurePath) {
  if (!existsSync(featurePath)) return 0;
  const content = readFileSync(featurePath, "utf8");
  return (content.match(/^\s*Scenario:/gm) || []).length;
}

function runOrquestrador(scratchDir) {
  const prompt =
    "Use o agente orquestrador-e2e para gerar os testes e2e a partir dos cartões existentes neste projeto.";
  return spawnSync(
    "claude",
    ["-p", "--plugin-dir", ROOT, "--dangerously-skip-permissions", "--output-format", "json", prompt],
    {
      cwd: scratchDir,
      env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3" },
      encoding: "utf8",
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: 100 * 1024 * 1024,
    }
  );
}

function runFixture(name) {
  const fixtureDir = path.join(FIXTURES_DIR, name);
  const expected = loadYaml(readFileSync(path.join(fixtureDir, "expected.yaml"), "utf8"));
  const scratchDir = path.join(RUNS_DIR, `${name}-${process.pid}-${Date.now()}`);
  mkdirSync(scratchDir, { recursive: true });

  console.log(`\n=== ${name} ===`);

  let origemId;
  try {
    ({ origemId } = placeInputCard(scratchDir, fixtureDir));
  } catch (err) {
    return { name, pass: false, reason: err.message };
  }

  console.log(`  rodando orquestrador-e2e (cartão de entrada: ${origemId})...`);
  const result = runOrquestrador(scratchDir);
  if (result.error) {
    return { name, pass: false, reason: `erro ao invocar claude CLI: ${result.error.message}`, scratchDir };
  }
  if (result.status !== 0 && result.signal) {
    return {
      name,
      pass: false,
      reason: `claude CLI foi encerrado por timeout/sinal (${result.signal})`,
      scratchDir,
    };
  }

  const problemas = [];

  const featurePath = path.join(scratchDir, "features", `${origemId}.feature`);
  if (!existsSync(featurePath)) {
    problemas.push(`features/${origemId}.feature não foi gravado`);
  } else {
    const scenarioCount = countScenarios(featurePath);
    const minimo = expected.minimo_scenarios ?? 1;
    if (scenarioCount < minimo) {
      problemas.push(`features/${origemId}.feature tem ${scenarioCount} Scenario(s), esperava >= ${minimo}`);
    }
    if (expected.requer_rule_block) {
      const content = readFileSync(featurePath, "utf8");
      if (!/^\s*Rule:/m.test(content)) {
        problemas.push(`features/${origemId}.feature não tem nenhum bloco Rule: (esperado por regras_relacionadas)`);
      }
    }
  }

  const pageObjectsDir = path.join(scratchDir, "page-objects");
  let pageObjectFiles = [];
  try {
    pageObjectFiles = readdirSync(pageObjectsDir).filter((f) => f.endsWith(".page.ts"));
  } catch {
    // diretório pode não existir ainda
  }
  if (pageObjectFiles.length === 0) {
    problemas.push("nenhum page-objects/*.page.ts foi gravado");
  } else {
    const combined = pageObjectFiles
      .map((f) => readFileSync(path.join(pageObjectsDir, f), "utf8"))
      .join("\n");
    if (expected.requer_todo_selectors && !/getByTestId\(['"]TODO_/.test(combined)) {
      problemas.push("nenhum page object usa o padrão de seletor pendente TODO_*");
    }
    for (const metodo of expected.metodos_page_object_esperados || []) {
      if (!combined.includes(metodo)) {
        problemas.push(`nenhum page object tem um método reconhecível como "${metodo}"`);
      }
    }
  }

  if (expected.step_definitions_esperado !== false) {
    const stepDefsDir = path.join(scratchDir, "step-definitions");
    let stepFiles = [];
    try {
      stepFiles = readdirSync(stepDefsDir).filter((f) => f.endsWith(".steps.ts"));
    } catch {
      // diretório pode não existir
    }
    if (stepFiles.length === 0) {
      problemas.push("nenhum step-definitions/*.steps.ts foi gravado");
    }
  }

  if (expected.requer_tsc_pass) {
    console.log("  rodando npm install no scratch dir (pode demorar)...");
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: scratchDir,
      encoding: "utf8",
      timeout: NPM_INSTALL_TIMEOUT_MS,
    });
    if (install.status !== 0) {
      problemas.push(`npm install falhou no scratch dir: ${(install.stderr || "").slice(0, 500)}`);
    } else {
      const tscBin = path.join(scratchDir, "node_modules", ".bin", "tsc");
      if (!existsSync(tscBin)) {
        problemas.push("npm install rodou mas node_modules/.bin/tsc não apareceu");
      } else {
        const tsc = spawnSync(tscBin, ["--noEmit"], { cwd: scratchDir, encoding: "utf8" });
        if (tsc.status !== 0) {
          problemas.push(`tsc --noEmit falhou:\n${(tsc.stdout || tsc.stderr || "").slice(0, 1000)}`);
        }
      }
    }
  }

  console.log(`  problemas encontrados: ${problemas.length === 0 ? "nenhum" : problemas.length}`);

  return { name, pass: problemas.length === 0, reason: problemas.join("; "), scratchDir };
}

mkdirSync(RUNS_DIR, { recursive: true });

const fixtures = listFixtures();
if (fixtures.length === 0) {
  console.error(`Nenhum fixture encontrado${filterArg ? ` para o filtro "${filterArg}"` : ""}.`);
  process.exit(1);
}

console.log(
  `Rodando ${fixtures.length} fixture(s) — cada um invoca o Claude Code CLI de verdade, isso custa tempo e chamadas de API reais.`
);

const results = fixtures.map(runFixture);

console.log("\n=== Resultado ===");
let anyFail = false;
for (const r of results) {
  if (r.pass) {
    console.log(`PASS  ${r.name}`);
  } else {
    anyFail = true;
    console.log(`FAIL  ${r.name} — ${r.reason}`);
    console.log(`      (scratch dir preservado para inspeção: ${r.scratchDir})`);
  }
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} fixtures passaram.`);

if (!anyFail) {
  for (const r of results) {
    if (r.scratchDir) rmSync(r.scratchDir, { recursive: true, force: true });
  }
}

process.exit(anyFail ? 1 : 0);
