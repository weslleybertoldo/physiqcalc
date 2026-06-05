# Mídia + detalhes do exercício (gif/foto, subgrupo, dica)

## Context
Hoje, ao clicar no nome do exercício, o `ModalExercicio` mostra só emoji + nome +
grupo muscular. O usuário quer, espelhando o guia de exercícios de referência,
exibir uma **foto ou gif** do exercício no topo, e abaixo **grupo muscular**,
**subgrupo** e uma **dica**. A mídia e os textos são adicionados pelo admin no
catálogo (`tb_exercicios`); exercícios pessoais do usuário ficam fora do escopo.

## Decisões
- **Origem da mídia:** upload via **Supabase Storage** (bucket novo).
- **Escopo:** só catálogo (`tb_exercicios`), gerenciado no painel admin.
- **Campos novos:** `imagem_url`, `subgrupo`, `dica` — todos opcionais (nullable).

## Mudanças

### 1. Banco (`tb_exercicios`)
Migration (PAT + Management API) adiciona 3 colunas nullable:
`imagem_url text`, `subgrupo text`, `dica text`.

### 2. PowerSync
- `src/lib/powersync/schema.ts`: adicionar as 3 colunas na Table `tb_exercicios`.
- `powersync/sync-config.yaml`: o stream `global` distribui `tb_exercicios`;
  garantir que o SELECT inclua as novas colunas (ajustar se for explícito).
  Deploy via `powersync deploy sync-config` (Prod + Dev).

### 3. Storage
- Bucket `exercicios`, **público para leitura** (imagem genérica, carrega pela
  URL e cacheia; funciona offline via SW cache).
- **Escrita só admin:** policies em `storage.objects` permitindo
  insert/update/delete no bucket apenas quando
  `auth.jwt()->'app_metadata'->>'role' = 'admin'`.

### 4. Admin (`src/components/admin/AdminTreinos.tsx`)
No form de criar/editar exercício adicionar:
- seletor de arquivo (image/* incluindo gif) com preview → `supabase.storage
  .from('exercicios').upload(...)` → grava `getPublicUrl` em `imagem_url`;
- input texto **subgrupo**; textarea **dica**.
Validação: tipo `image/*`, tamanho máx (ex. 5MB). Nome do arquivo único
(`${exercicioId|uuid}.${ext}`), `upsert: true`.

### 5. Modal (`src/components/treinos/ModalExercicio.tsx`)
Reestrutura o conteúdo: **mídia no topo** (`<img>` com `onError` fallback;
gif anima nativamente) → **grupo muscular** → **subgrupo** (se houver) →
**dica** (se houver). Header mantém emoji + nome. Interface `Exercicio` ganha
`imagem_url?`, `subgrupo?`, `dica?`.

### 6. Passagem de dados (`src/components/treinos/TreinoDoDia.tsx`)
A `interface Exercicio` e o objeto passado ao `ModalExercicio` incluem os 3
campos novos (já vêm da query de `tb_exercicios` via PowerSync).

## Verificação
1. Migration aplicada — `\d tb_exercicios` mostra as 3 colunas.
2. Bucket `exercicios` existe e é público; upload anônimo é negado, upload como
   admin funciona.
3. Admin: subo um gif num exercício, preencho subgrupo + dica, salvo, recarrego
   → URL e textos persistem em `tb_exercicios`.
4. App (PWA): clico no exercício → modal mostra gif animando + grupo + subgrupo
   + dica. Exercício sem mídia → modal como antes (sem quebrar).
5. Outro usuário (sem role admin) não consegue subir/alterar mídia.
