# bdd-e2e-tester

Pipeline de 6 subagentes que transforma cartões de user story e caso de uso
já produzidos pelo plugin
[`requisitos-pipeline`](https://github.com/wenderu00/requisitos-pipeline)
(`user-stories/US-<id>.yaml`, `casos-de-uso/UC-<id>.yaml`) em uma camada de
testes e2e no padrão BDD/Playwright — Gherkin (`.feature`) + Page Objects
(`.page.ts`) + step definitions (`.steps.ts`), via
[playwright-bdd](https://github.com/vitalets/playwright-bdd). Funciona
mesmo sem o sistema real implementado: todo seletor gerado é uma pendência
explícita (`TODO_*`), nunca uma inferência arriscada de DOM que não existe.

## Instalação

```
claude plugin marketplace add wenderu00/bdd-e2e-tester
claude plugin install bdd-e2e-tester@bdd-e2e-tester
```

Depois de instalar, rode `npm install` **na raiz deste plugin** (não no
projeto onde os testes e2e serão gerados) — instala `@cucumber/gherkin`, a
dependência do hook de validação de sintaxe Gherkin (ver
[`docs/hooks.md`](docs/hooks.md) para o porquê desta ser a única exceção ao
padrão "zero `npm install`" do pipeline irmão).

## Fluxo ponta a ponta

```
user-stories/US-<id>.yaml / casos-de-uso/UC-<id>.yaml (do requisitos-pipeline)
  -> orquestrador-e2e
       varre US-*.yaml e UC-*.yaml sem entrada em features/_cobertura/COBERTURA.yaml
       escafolda package.json/tsconfig.json/playwright.config.ts se necessário
       (RNF-*.yaml sempre ignorado nesta v1 — fora de escopo)
       para cada cartão pendente, sequencialmente:
         gerador-feature            -> features/<ID>.feature
           (Scenario por criterio_aceite/fluxo; Rule: por regra_de_negocio relacionada)
         gerador-page-object        -> page-objects/<pagina>.page.ts
           (cria ou estende, via page-objects/_indice/INDEX.yaml; seletores TODO_*)
         gerador-step-definitions   -> step-definitions/<ID>.steps.ts
           (reaproveita steps já definidos, via step-definitions/_indice/INDEX.yaml)
       (os 3 acima chamam auditor-qualidade-e2e internamente, até 3x cada,
       com critérios de qualidade específicos do tipo de artefato)
       atualiza features/_cobertura/COBERTURA.yaml a cada cartão processado
       ao final: chama auditor-coerencia-e2e uma vez (automático, best-effort)
       comparando os artefatos já materializados entre si
```

Todos os diretórios de saída (`features/`, `page-objects/`,
`step-definitions/`) são criados no diretório de trabalho de quem usa o
plugin — são artefatos do projeto do usuário, não fazem parte do pacote
deste plugin. O mesmo vale para `package.json`/`tsconfig.json`/
`playwright.config.ts` do projeto de testes e2e, escafoldados pelo
`orquestrador-e2e` na primeira execução.

## Como usar

Ponto de entrada único: peça para chamar o agente `orquestrador-e2e` num
diretório que já tem `user-stories/`/`casos-de-uso/` (produzidos pelo
`requisitos-pipeline`). Sem argumentos, ele processa tudo que ainda não tem
e2e gerado; passe IDs específicos (`US-<n>`/`UC-<n>`) para reprocessar
cartões já cobertos.

Depois da primeira execução (que escafolda o projeto Node), rode
`npm install` na raiz do projeto de testes e2e — **diferente** do
`npm install` da seção de instalação acima, que é só para as dependências
do hook deste plugin. São dois `package.json` diferentes, em dois lugares
diferentes.

Para rodar os testes gerados de verdade (depois de preencher os seletores
`TODO_*` com os `data-testid` reais do sistema):

```
npm run test:e2e       # bddgen && playwright test
npm run test:e2e:ui    # bddgen && playwright test --ui
```

## Convenção de diretórios de saída

```
features/US-<id>.feature              # ou UC-<id>.feature
features/_cobertura/COBERTURA.yaml    # índice cumulativo: o que já tem e2e gerado
features/_execucoes/RUN-<n>.yaml      # log persistente de cada execução do orquestrador
page-objects/<nome-pagina>.page.ts
page-objects/_indice/INDEX.yaml       # página -> arquivo/classe/métodos, para reuso
step-definitions/<id>.steps.ts        # US-<id>.steps.ts ou UC-<id>.steps.ts
step-definitions/_indice/INDEX.yaml   # texto de step -> arquivo onde já está definido
```

## Convenção de seletores pendentes

Sem o sistema real implementado não há DOM pra inspecionar — todo seletor é
`page.getByTestId('TODO_<pagina>_<elemento_em_snake_case>')`. Ache tudo que
falta implementar quando o componente/página real existir:

```
grep -rn "TODO_" page-objects/
```

## Schema dos índices YAML

Detalhes completos em [`docs/schemas.md`](docs/schemas.md). Resumo dos 4
tipos (todos em `schemas/schemas.json`, fonte única de verdade):

- `page_object_index` — `page-objects/_indice/INDEX.yaml`
- `step_index` — `step-definitions/_indice/INDEX.yaml`
- `cobertura` — `features/_cobertura/COBERTURA.yaml`
- `execucao` — `features/_execucoes/RUN-<n>.yaml`

Exemplo de `page_object_index`:

<!-- SYNC:schema:page_object_index:START -->
```yaml
schema_version: 1
entradas:
  - nome_pagina: "checkout"
    arquivo: "page-objects/checkout.page.ts"
    classe: "CheckoutPage"
    metodos: ["informarDadosCartao", "confirmarPagamento"]
    origens: ["UC-2"]
```
<!-- SYNC:schema:page_object_index:END -->

Exemplo de `cobertura`:

<!-- SYNC:schema:cobertura:START -->
```yaml
schema_version: 1
entradas:
  - origem_id: "UC-2"
    tipo: caso_de_uso
    feature_gerado: "features/UC-2.feature"
    page_objects_atualizados: ["page-objects/checkout.page.ts"]
    step_definitions_gerados: ["step-definitions/UC-2.steps.ts"]
    status: concluido
    auditoria:
      feature: aprovado
      page_object: aprovado
      step_definitions: aprovado
```
<!-- SYNC:schema:cobertura:END -->

## Profundidade de subagentes

Cadeia real: `orquestrador-e2e` (nível 1) → `gerador-feature` /
`gerador-page-object` / `gerador-step-definitions` (nível 2) →
`auditor-qualidade-e2e` (nível 3, chamado pelos 3 especialistas, até 3
chamadas cada). `auditor-coerencia-e2e` é um ramo irmão mais raso (nível 1 →
nível 2, chamado direto pelo orquestrador), não empilhado sobre o ramo de
auditoria de qualidade — não aumenta a profundidade máxima. Se você tiver
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` configurado baixo, aumente para pelo
menos 3.

## Guardrails determinísticos (hooks)

`hooks/hooks.json` registra três hooks Node.js `PostToolUse`:
`scripts/hooks/validate-gherkin.mjs` (sintaxe Gherkin dos `.feature`),
`scripts/hooks/validate-ts.mjs` (`tsc --noEmit` dos `.page.ts`/`.steps.ts`)
e `scripts/hooks/validate-index.mjs` (schema dos 4 índices YAML acima, sem
dependência de `npm install` — parser YAML vendorizado em
`scripts/vendor/`). Sem `claim-id`: nomes de arquivo já são determinísticos,
sem corrida de numeração a resolver. Detalhes e racional em
[`docs/hooks.md`](docs/hooks.md).

## Log persistente de execução

`orquestrador-e2e` grava e mantém atualizado, ao longo de toda a execução
(não só no final), um arquivo `features/_execucoes/RUN-<n>.yaml` com o
progresso do processamento — mesmo racional do `requisitos-pipeline`: o
resumo impresso no chat só existe enquanto a conversa não for compactada, e
o Claude Code compacta conversas longas automaticamente. Gravar o mesmo
progresso como um artefato normal em disco, atualizado cartão por cartão, é
o que permite recuperar o que já foi processado mesmo que a conversa seja
compactada no meio da execução.

## Testes

Duas suítes, mesma separação do `requisitos-pipeline` — ver
[`tests/README.md`](tests/README.md) para uso detalhado:

- `tests/integrity/` — sintética, sem LLM, roda em CI
  (`node --test tests/integrity/*.test.mjs`).
- `tests/eval/` — invoca a CLI real, cara, manual
  (`node tests/eval/run.mjs`).

`scripts/check-integrity.mjs <diretório>` é um script standalone (sem LLM)
que verifica um projeto que já usou o pipeline: artefatos referenciados nos
índices que não existem mais em disco, e referências pendentes entre
índices e `features/_cobertura/COBERTURA.yaml`.

## Desenvolvimento

### Estrutura do repositório

```
.claude-plugin/          plugin.json + marketplace.json
agents/                  os 6 subagentes (orquestrador, 3 especialistas, 2 avaliadores)
schemas/schemas.json     fonte única de verdade dos 4 índices YAML
scripts/                 hooks (scripts/hooks/), sync-schemas.mjs, check-integrity.mjs
scripts/vendor/          parser YAML vendorizado (sem npm install)
hooks/hooks.json         wiring dos 3 hooks PostToolUse
tests/integrity/         suíte sintética (CI)
tests/eval/               suíte de regressão (manual, cara)
tests/fixtures/           fixtures da suíte de regressão
docs/                     hooks.md, schemas.md
```

### Requisitos

`npm install` na raiz do plugin (dependências dos hooks, ver "Instalação").
`npm install` adicional na raiz de qualquer projeto onde o
`orquestrador-e2e` escafoldou `package.json` (dependências do próprio
projeto de testes e2e — `@playwright/test`, `playwright-bdd`,
`typescript`).

### Editando schemas

Edite `schemas/schemas.json`, depois rode `node scripts/sync-schemas.mjs`
(ou `--check` para só verificar divergência). Nunca edite os blocos
`<!-- SYNC:... -->` diretamente em `agents/*.md`.

### Rodando os testes

```
node --test tests/integrity/*.test.mjs   # rápido, sem LLM
node tests/eval/run.mjs                  # lento, invoca a CLI real
```

### Criando um segundo plugin

Ver [`CONTRIBUTING.md`](https://github.com/wenderu00/requisitos-pipeline/blob/main/CONTRIBUTING.md)
do `requisitos-pipeline` — o padrão arquitetural (orquestrador/especialista/
avaliador, schema único, hooks determinísticos, duas suítes de teste) que
este plugin replica está documentado ali em detalhe.

## Tratamento de falha

Nenhum estágio trava o pipeline inteiro por falha de um único cartão ou de
um único estágio (feature/page-object/step-definitions). Falhas são
registradas em `features/_cobertura/COBERTURA.yaml` (`status:
falha_parcial`) e em `features/_execucoes/RUN-<n>.yaml`, e reportadas no
resumo final — cartões com falha podem ser reprocessados chamando
`orquestrador-e2e` de novo com o ID específico.
