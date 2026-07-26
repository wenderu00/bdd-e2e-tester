# Hooks determinísticos

`hooks/hooks.json` registra três scripts Node.js, todos `PostToolUse` no
matcher `Write`. Diferente do `requisitos-pipeline`, não há hook
`PreToolUse`/`claim-id`: os nomes de arquivo deste plugin já são
determinísticos (`US-<id>.feature`, `UC-<id>.feature`, nome de página
kebab-case) em vez de numeração sequencial calculada via `Glob`+incremento —
não existe a corrida de "próximo ID" que o `claim-id.mjs` original resolve.

## `scripts/hooks/validate-gherkin.mjs` (`.feature`)

Único hook deste plugin que depende de `npm install` — exceção deliberada
ao padrão "zero dependências" do `requisitos-pipeline` (que vendoriza seu
próprio parser YAML em `scripts/vendor/js-yaml.mjs`). Não existe alternativa
razoável a vendorizar um parser Gherkin inteiro; `@cucumber/gherkin` (o
parser oficial, mesmo usado pelo Cucumber.js e pelo playwright-bdd) é
declarado em `package.json` na **raiz do plugin** — rode `npm install` ali
uma vez depois de instalar o plugin.

Resolução do módulo é relativa ao próprio script (`scripts/hooks/`), não ao
`cwd` do projeto onde os testes e2e são gerados — a árvore `node_modules`
que importa é a do plugin, não a do projeto alvo (essa é escafoldada
separadamente pelo `orquestrador-e2e`, com `playwright-bdd`/`@playwright/test`,
ver seção 2 de `agents/orquestrador-e2e.md`).

Se `@cucumber/gherkin` não estiver instalado (plugin acabou de ser
instalado, `npm install` ainda não rodou), o hook **degrada para aviso não
bloqueante** em vez de falhar — nunca impede o `Write` de completar, só
deixa de validar até a dependência existir.

Quando disponível, o parser real captura erros sintáticos (`Feature:`
ausente, keyword mal formada, step fora de qualquer bloco `Feature`/`Rule`).
Um caso que o parser **não** pega sozinho — um `Scenario` "mal escrito" sem
`:` vira texto de descrição em vez de erro de sintaxe — é coberto por uma
checagem estrutural adicional do próprio hook: pelo menos 1 `Scenario`
(direto na `Feature` ou dentro de algum `Rule`) com pelo menos 1 step.

## `scripts/hooks/validate-ts.mjs` (`.page.ts` / `.steps.ts`)

Roda `tsc --noEmit --skipLibCheck` sobre o arquivo recém-gravado, usando o
`typescript` **do projeto alvo** (`<cwd>/node_modules/.bin/tsc`), nunca o do
plugin — faz sentido checar os tipos contra o `@playwright/test`/
`playwright-bdd` que o próprio projeto tem instalado.

Como o `orquestrador-e2e` escafolda o projeto (`package.json`,
`tsconfig.json`) mas nunca roda `npm install` sozinho (seção 2 do agente),
o `node_modules` do projeto alvo pode genuinamente não existir ainda na
primeira execução do pipeline. Nesse caso o hook degrada para aviso não
bloqueante (mesmo racional do hook de Gherkin) — a checagem de tipos fica
ativa só depois que o usuário rodar `npm install` no projeto alvo.

Roda `tsc` sobre **um único arquivo** (não o projeto inteiro via
`tsconfig.json`) deliberadamente: rodar sobre o projeto inteiro bloquearia
o `Write` de um page object por causa de um erro de tipo num step
definition ainda incompleto de outro cartão sendo processado em paralelo no
mesmo pipeline sequencial (`gerador-feature` → `gerador-page-object` →
`gerador-step-definitions` grava 3 arquivos em sequência, não atomicamente).

## `scripts/hooks/validate-index.mjs` (índices YAML)

Equivalente direto do `validate-card.mjs` do `requisitos-pipeline` — mesma
lógica de validação de schema contra `schemas/schemas.json` (reaproveitando
o parser YAML vendorizado, `scripts/vendor/js-yaml.mjs`, sem dependência de
`npm install`), aplicada aos 4 arquivos YAML deste plugin em vez dos 6
cartões de requisito do pipeline original:
`page-objects/_indice/INDEX.yaml`, `step-definitions/_indice/INDEX.yaml`,
`features/_cobertura/COBERTURA.yaml` e `features/_execucoes/RUN-<id>.yaml`.
Sem a heurística de calibração de confiança do hook original — nenhum dos 4
tipos deste plugin tem um campo `confiança` numérico, não há "confiança alta
com campos rasos" a detectar aqui.

`exit(2)` em `PostToolUse` não desfaz o `Write` (o arquivo já foi escrito),
mas mostra o stderr para o agente como um erro a corrigir — na prática,
força o agente a reescrever o arquivo antes de seguir em frente. Vale para
os três hooks acima.
