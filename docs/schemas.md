# `schemas/schemas.json`

Fonte única de verdade para os 4 tipos de índice/log YAML gravados pelo
pipeline `bdd-e2e-tester`. Editado à mão.

Diferente do `requisitos-pipeline` (6 tipos de cartão de requisito, o
produto final do pipeline), aqui os 4 tipos são todos **estado
interno/auxiliar** do pipeline (índices de reuso, cobertura, log de
execução) — o produto final (`.feature`, `.page.ts`, `.steps.ts`) é código,
não YAML, e não passa por este arquivo nem pelo hook que o lê (ver
`docs/hooks.md`, seção `validate-gherkin.mjs`/`validate-ts.mjs`).

Consumido por dois lugares independentes, mesmo padrão do
`requisitos-pipeline`:

- `scripts/sync-schemas.mjs` regenera os blocos marcados com
  `<!-- SYNC:... -->` em `agents/*.md` a partir daqui.
- `scripts/hooks/validate-index.mjs` lê este arquivo em tempo de execução
  para validar o que foi escrito em disco depois de cada `Write`.

Nunca edite os blocos gerados diretamente nos arquivos `.md` — edite
`schemas.json` e rode `node scripts/sync-schemas.mjs`. Rode com `--check`
para só verificar divergência sem escrever nada.

## Os 4 tipos

- **`page_object_index`** (`page-objects/_indice/INDEX.yaml`, singleton) —
  mapeia nome de página → arquivo/classe/métodos já existentes, para o
  `gerador-page-object` decidir entre criar uma classe nova ou estender uma
  existente.
- **`step_index`** (`step-definitions/_indice/INDEX.yaml`, singleton) —
  mapeia texto de step (normalizado, com `{string}`/`{int}` no lugar de
  valores literais) → arquivo onde já está definido, para o
  `gerador-step-definitions` nunca redefinir o mesmo step em dois arquivos
  (o que quebraria playwright-bdd em runtime com "Multiple definitions
  found").
- **`cobertura`** (`features/_cobertura/COBERTURA.yaml`, singleton) —
  índice cumulativo de quais `US-<id>`/`UC-<id>` já têm e2e gerado, usado
  pelo `orquestrador-e2e` para decidir o escopo de cada execução (seção 1 de
  `agents/orquestrador-e2e.md`).
- **`execucao`** (`features/_execucoes/RUN-<id>.yaml`, um arquivo por
  execução) — log persistente de uma execução do `orquestrador-e2e`, mesmo
  racional de resiliência a compactação de conversa do `RUN-<id>.yaml` do
  `requisitos-pipeline`.

Todos os 4 usam `singleton_filename` ou `id_prefix` (nunca `filename_regex`
— nenhum tipo deste plugin tem um padrão de nome de arquivo irregular como
o `pendencia` do `requisitos-pipeline`), então `validate-index.mjs`
resolve o tipo de cada `Write` da mesma forma simples que o
`validate-card.mjs` original: `singleton_filename` casa por caminho exato,
senão `<output_dir>/<id_prefix><número>.yaml`.

Campos de lista com `item_pattern` (regex por item, ex. `origens` validado
item a item como `^(US|UC)-\d+$`) seguem exatamente a mesma convenção do
`requisitos-pipeline` — reservado para listas de strings simples, não para
listas de objetos estruturados (essas usam `item_fields`, ex. `entradas` em
cada um dos 4 tipos).

Se você adicionar um novo tipo de índice no futuro, prefira o padrão
`output_dir` + `singleton_filename` (para estado único e cumulativo) ou
`output_dir` + `id_prefix` (para um arquivo por execução/entidade
numerada) — os mesmos dois padrões já cobrem os 4 tipos atuais.
