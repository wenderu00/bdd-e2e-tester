# Testes do plugin bdd-e2e-tester

Duas suítes, mesma separação do `requisitos-pipeline`.

## `tests/integrity/` — suíte sintética, sem LLM, rápida, roda em CI

`node --test`, nativo, sem framework externo. Testa os scripts standalone
que não dependem de resposta de modelo: os 3 hooks
(`scripts/hooks/validate-gherkin.mjs`, `validate-ts.mjs`,
`validate-index.mjs`) e o verificador de integridade referencial
(`scripts/check-integrity.mjs`).

```
node --test tests/integrity/*.test.mjs
```

(`node --test tests/integrity/` sem glob não funciona de forma confiável em
todas as versões do Node — sempre use o glob explícito acima.)

Pré-requisitos:
- `npm install` na raiz do plugin (não no projeto onde os testes e2e são
  gerados) — instala `@cucumber/gherkin`/`@cucumber/messages` (usados pelo
  hook de verdade) e `typescript` (usado só pelos testes de
  `validate-ts.test.mjs`, para simular um projeto alvo com `tsc` disponível
  via symlink para o `node_modules` do próprio plugin).
- Sem isso, `validate-gherkin.test.mjs` falha (o hook real precisa do
  parser) e os 2 testes de `validate-ts.test.mjs` que exercitam compilação
  de verdade são pulados (`skip`) automaticamente — os demais continuam
  passando.

## `tests/eval/` — suíte de regressão que invoca a CLI real, cara, não roda em CI

Ferramenta manual, opt-in. Rode depois de editar as regras de geração em
qualquer um dos agentes (`agents/gerador-feature.md`,
`agents/gerador-page-object.md`, `agents/gerador-step-definitions.md`,
`agents/orquestrador-e2e.md`), antes de considerar a mudança pronta.

```
node tests/eval/run.mjs                          # roda todos os fixtures
node tests/eval/run.mjs 02-caso-de-uso            # roda só fixtures cujo nome contém esse texto
```

Cada fixture cria um diretório de scratch isolado e git-ignorado em
`tests/eval/.runs/`, coloca o cartão de entrada do fixture no lugar certo
(`user-stories/US-<n>.yaml` ou `casos-de-uso/UC-<n>.yaml`, inferido do
prefixo do nome do arquivo), invoca
`claude -p --plugin-dir <repo> --dangerously-skip-permissions` carregando
este plugin localmente (sem instalar) com o prompt "use o agente
orquestrador-e2e", e compara a saída gerada contra `expected.yaml` do
fixture. `--dangerously-skip-permissions` só é usado porque o `cwd` de cada
chamada é o diretório de scratch isolado que o próprio harness cria — nunca
o repositório real do usuário.

Diferente do `requisitos-pipeline` (que compara `tipo`s exatos de saída
estruturada), aqui a saída é código (Gherkin/TypeScript) sujeito a variação
legítima de redação do LLM — a comparação é **estrutural**, nunca diff
exato de texto: existência de arquivo, contagem mínima de `Scenario`s,
presença de bloco `Rule:`, presença do padrão de seletor `TODO_*`,
existência de step definitions, e (só quando o fixture pede
`requer_tsc_pass: true`) uma checagem completa de `npm install` + `tsc
--noEmit` no próprio scratch dir — este último é bem mais lento (baixa
dependências de verdade), por isso só 1 dos 3 fixtures atuais usa essa
flag.

Scratch dirs de fixtures que passaram são removidos automaticamente;
scratch dirs de fixtures que falharam ficam para inspeção manual (o caminho
aparece no relatório final).

## Não-determinismo

Geração de Gherkin/TypeScript é feita por um LLM — o texto exato varia
entre execuções. As asserções de `expected.yaml` são propositalmente
estruturais (contagens mínimas, presença de padrões), não comparação
literal, para tolerar essa variação sem virar um teste frágil.

## Fixtures

Cada `tests/fixtures/<nome>/` tem:
- `<ID>.yaml` (`US-<n>.yaml` ou `UC-<n>.yaml`) — o cartão de entrada, no
  mesmo schema que o `requisitos-pipeline` produz.
- `expected.yaml` — asserções estruturais:

```yaml
minimo_scenarios: 1              # Scenarios mínimos esperados no .feature gerado
requer_rule_block: false         # true se o fixture tem regras_relacionadas e espera um bloco Rule:
requer_todo_selectors: true      # espera pelo menos 1 getByTestId('TODO_...') no(s) page object(s)
metodos_page_object_esperados: []  # nomes de método esperados em algum page object (substring match)
step_definitions_esperado: true  # espera pelo menos 1 arquivo step-definitions/*.steps.ts gerado
requer_tsc_pass: false           # se true, roda npm install + tsc --noEmit de verdade no scratch dir (lento)
```

- `support/` (opcional) — arquivos extra copiados verbatim para o scratch
  dir antes de rodar (ex. `support/regras-de-negocio/RN-1.yaml`, para
  testar o mapeamento de regras de negócio para blocos `Rule:`).

Casos cobertos: user story simples de 1 critério de aceite, caso de uso com
fluxo principal + fluxo alternativo + 1 regra de negócio relacionada
(regressão do bloco `Rule:`), e user story com 2 critérios de aceite
gerando 2 `Scenario`s (regressão de múltiplos cenários — este último também
valida o pipeline completo até `tsc --noEmit` passar de verdade).
