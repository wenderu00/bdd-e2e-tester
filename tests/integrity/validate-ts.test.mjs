#!/usr/bin/env node

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "hooks", "validate-ts.mjs");
const PLUGIN_ROOT = path.join(__dirname, "..", "..");

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

// Reaproveita o typescript instalado nas devDependencies do plugin
// (usado só para testar este hook — o hook em si sempre roda o tsc do
// projeto ALVO, nunca o do plugin).
function linkTypescript(dir) {
  mkdirSync(path.join(dir, "node_modules", ".bin"), { recursive: true });
  symlinkSync(
    path.join(PLUGIN_ROOT, "node_modules", "typescript"),
    path.join(dir, "node_modules", "typescript"),
    "dir"
  );
  symlinkSync(
    path.join(PLUGIN_ROOT, "node_modules", ".bin", "tsc"),
    path.join(dir, "node_modules", ".bin", "tsc"),
    "file"
  );
}

const hasPluginTypescript = existsSync(
  path.join(PLUGIN_ROOT, "node_modules", ".bin", "tsc")
);

test("sem node_modules no projeto alvo: aviso não-bloqueante (exit 0)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-ts-test-"));
  const { status, stdout } = runHook(
    dir,
    "page-objects/checkout.page.ts",
    "export class CheckoutPage {}\n"
  );
  assert.equal(status, 0);
  assert.match(stdout, /Aviso/);
  rmSync(dir, { recursive: true, force: true });
});

test(
  "TS valido com tsc disponivel: exit 0, sem output de erro",
  { skip: !hasPluginTypescript },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "validate-ts-test-"));
    linkTypescript(dir);
    const { status } = runHook(
      dir,
      "page-objects/checkout.page.ts",
      "export class CheckoutPage {\n  soma(a: number, b: number): number {\n    return a + b;\n  }\n}\n"
    );
    assert.equal(status, 0);
    rmSync(dir, { recursive: true, force: true });
  }
);

test(
  "TS invalido (erro de tipo) com tsc disponivel: bloqueia",
  { skip: !hasPluginTypescript },
  () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "validate-ts-test-"));
    linkTypescript(dir);
    const { status, stderr } = runHook(
      dir,
      "page-objects/checkout.page.ts",
      "export class CheckoutPage {\n  soma(a: number, b: number): number {\n    return a + \"oops\";\n  }\n}\n"
    );
    assert.equal(status, 2);
    assert.match(stderr, /TypeScript não compila/);
    rmSync(dir, { recursive: true, force: true });
  }
);

test("arquivo fora de page-objects/ ou step-definitions/: hook ignora", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "validate-ts-test-"));
  const { status } = runHook(dir, "src/outro.ts", "const x: number = \"nao bate\";\n");
  assert.equal(status, 0);
  rmSync(dir, { recursive: true, force: true });
});
